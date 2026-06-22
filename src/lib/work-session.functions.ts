import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type Role = "ceo" | "incharge" | "member" | "qa";

async function getCaller(explicitToken?: string) {
  let token = explicitToken;
  if (!token) {
    const req = getRequest();
    const auth = req?.headers?.get("authorization");
    if (auth?.startsWith("Bearer ")) token = auth.slice(7);
  }
  if (!token) return { ok: false as const, error: "Unauthorized" };
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !KEY) return { ok: false as const, error: "Server not configured" };
  const client = createClient<Database>(SUPABASE_URL, KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false as const, error: "Invalid session" };
  return { ok: true as const, userId: data.user.id };
}

// ---------- Clock in ----------
export const clockIn = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    // If an open session already exists, return it (idempotent)
    const { data: existing } = await supabaseAdmin
      .from("study_sessions")
      .select("id, started_at, status, paused_at, paused_seconds")
      .eq("user_id", ctx.userId)
      .is("ended_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        ok: true as const,
        sessionId: existing.id,
        startedAt: existing.started_at,
        status: (existing as any).status ?? "active",
      };
    }

    const { data: row, error } = await supabaseAdmin
      .from("study_sessions")
      .insert({ user_id: ctx.userId, client_info: { mode: "work" }, status: "active" } as any)
      .select("id, started_at")
      .single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "Failed" };
    return { ok: true as const, sessionId: row.id, startedAt: row.started_at, status: "active" };
  });

// ---------- Heartbeat ----------
export const heartbeatSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; deltaActiveSec: number; accessToken?: string }) => d)
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    const { data: cur } = await supabaseAdmin
      .from("study_sessions")
      .select("user_id, active_seconds, ended_at, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!cur || cur.user_id !== ctx.userId) return { ok: false as const, error: "Not found" };
    if (cur.ended_at) return { ok: false as const, error: "Already ended" };
    // Skip active accumulation while paused (defensive — client also gates this)
    const paused = (cur as any).status === "paused";
    const next = paused
      ? (cur.active_seconds ?? 0)
      : (cur.active_seconds ?? 0) + Math.max(0, Math.round(data.deltaActiveSec));
    await supabaseAdmin
      .from("study_sessions")
      .update({ active_seconds: next, last_heartbeat_at: new Date().toISOString() })
      .eq("id", data.sessionId);
    return { ok: true as const };
  });

// ---------- Pause ----------
export const pauseSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; deltaActiveSec?: number; accessToken?: string }) => d)
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    const { data: cur } = await supabaseAdmin
      .from("study_sessions")
      .select("user_id, active_seconds, ended_at, status")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!cur || cur.user_id !== ctx.userId) return { ok: false as const, error: "Not found" };
    if (cur.ended_at) return { ok: false as const, error: "Already ended" };
    if ((cur as any).status === "paused") {
      return { ok: true as const, pausedAt: new Date().toISOString() };
    }
    const nowIso = new Date().toISOString();
    const next =
      (cur.active_seconds ?? 0) + Math.max(0, Math.round(data.deltaActiveSec ?? 0));
    const { error } = await supabaseAdmin
      .from("study_sessions")
      .update({
        active_seconds: next,
        status: "paused",
        paused_at: nowIso,
        last_heartbeat_at: nowIso,
      } as any)
      .eq("id", data.sessionId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, pausedAt: nowIso };
  });

// ---------- Resume ----------
export const resumeSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; accessToken?: string }) => d)
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    const { data: cur } = await supabaseAdmin
      .from("study_sessions")
      .select("user_id, ended_at, status, paused_at, paused_seconds")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!cur || cur.user_id !== ctx.userId) return { ok: false as const, error: "Not found" };
    if (cur.ended_at) return { ok: false as const, error: "Already ended" };
    if ((cur as any).status !== "paused") {
      return { ok: true as const };
    }
    const pausedAtIso = (cur as any).paused_at as string | null;
    const addPausedSec = pausedAtIso
      ? Math.max(0, Math.round((Date.now() - new Date(pausedAtIso).getTime()) / 1000))
      : 0;
    const nextPaused = ((cur as any).paused_seconds ?? 0) + addPausedSec;
    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("study_sessions")
      .update({
        status: "active",
        paused_at: null,
        paused_seconds: nextPaused,
        last_heartbeat_at: nowIso,
      } as any)
      .eq("id", data.sessionId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, pausedSeconds: nextPaused };
  });

// ---------- Clock out + summary ----------
type EndReason = "manual" | "auto_idle_global" | "auto_idle_course";

async function callGeminiAI(prompt: string, systemPrompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not set — skipping AI summary");
    return null;
  }
  try {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
      encodeURIComponent(key);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
      }),
    });
    if (!res.ok) {
      console.warn("Gemini API error", res.status, await res.text());
      return null;
    }
    const json: any = await res.json();
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.warn("Gemini API exception", e);
    return null;
  }
}

export const clockOut = createServerFn({ method: "POST" })
  .inputValidator((d: {
    sessionId: string;
    endReason?: EndReason;
    deltaActiveSec?: number;
    accessToken?: string;
  }) => d)
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const { data: cur } = await supabaseAdmin
      .from("study_sessions")
      .select(
        "user_id, started_at, ended_at, active_seconds, status, paused_at, paused_seconds",
      )
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!cur || cur.user_id !== ctx.userId) return { ok: false as const, error: "Not found" };

    const endedAt = cur.ended_at ?? new Date().toISOString();
    const wasPaused = (cur as any).status === "paused";
    const pausedAtIso = (cur as any).paused_at as string | null;
    const extraPaused =
      wasPaused && pausedAtIso
        ? Math.max(0, Math.round((Date.now() - new Date(pausedAtIso).getTime()) / 1000))
        : 0;
    const totalPaused = ((cur as any).paused_seconds ?? 0) + extraPaused;
    const activeSec = wasPaused
      ? (cur.active_seconds ?? 0)
      : (cur.active_seconds ?? 0) + Math.max(0, Math.round(data.deltaActiveSec ?? 0));

    if (!cur.ended_at) {
      await supabaseAdmin
        .from("study_sessions")
        .update({
          ended_at: endedAt,
          active_seconds: activeSec,
          end_reason: data.endReason ?? "manual",
          status: "completed",
          paused_at: null,
          paused_seconds: totalPaused,
        } as any)
        .eq("id", data.sessionId);
    }

    // Gather context
    const [lessonsRes, projectsRes, gradesLessonRes, gradesProjectRes] = await Promise.all([
      supabaseAdmin
        .from("lesson_progress")
        .select("lesson_id, completed_at, lessons(title)")
        .eq("user_id", ctx.userId)
        .eq("completed", true)
        .gte("completed_at", cur.started_at)
        .lte("completed_at", endedAt),
      supabaseAdmin
        .from("project_submissions")
        .select("created_at, projects(title)")
        .eq("user_id", ctx.userId)
        .gte("created_at", cur.started_at)
        .lte("created_at", endedAt),
      supabaseAdmin
        .from("submissions")
        .select("letter_grade, grade, reviewed_at, lessons(title)")
        .eq("user_id", ctx.userId)
        .not("reviewed_at", "is", null)
        .gte("reviewed_at", cur.started_at)
        .lte("reviewed_at", endedAt),
      supabaseAdmin
        .from("project_submissions")
        .select("letter_grade, grade, reviewed_at, projects(title)")
        .eq("user_id", ctx.userId)
        .not("reviewed_at", "is", null)
        .gte("reviewed_at", cur.started_at)
        .lte("reviewed_at", endedAt),
    ]);

    const lessons = (lessonsRes.data ?? [])
      .map((r: any) => r.lessons?.title)
      .filter(Boolean);
    const projects = (projectsRes.data ?? [])
      .map((r: any) => r.projects?.title)
      .filter(Boolean);
    const grades: string[] = [];
    for (const g of gradesLessonRes.data ?? []) {
      const t = (g as any).lessons?.title;
      if (t && (g.letter_grade || g.grade != null)) {
        grades.push(`${t}: ${g.letter_grade ?? g.grade}`);
      }
    }
    for (const g of gradesProjectRes.data ?? []) {
      const t = (g as any).projects?.title;
      if (t && (g.letter_grade || g.grade != null)) {
        grades.push(`Project ${t}: ${g.letter_grade ?? g.grade}`);
      }
    }

    const activeHours = activeSec / 3600;
    const pausedMin = Math.round(totalPaused / 60);
    const prompt = [
      `Clock in: ${new Date(cur.started_at).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`,
      `Clock out: ${new Date(endedAt).toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`,
      `Total active time: ${activeHours.toFixed(2)} hours`,
      `Total paused time: ${pausedMin} minutes`,
      `End reason: ${data.endReason ?? "manual"}`,
      lessons.length ? `Lessons completed: ${lessons.join("; ")}` : "Lessons completed: none",
      projects.length ? `Projects submitted: ${projects.join("; ")}` : "Projects submitted: none",
      grades.length ? `Grades received: ${grades.join("; ")}` : "Grades received: none",
    ].join("\n");

    const systemPrompt =
      "You write a warm, encouraging end-of-session summary for a learner at a creative training academy. Max 4 sentences. Be specific about what they accomplished. Mention active hours (and pause time briefly if non-zero). Avoid emoji. Address them in second person.";

    const summary = await callGeminiAI(prompt, systemPrompt);
    if (summary) {
      await supabaseAdmin
        .from("study_sessions")
        .update({ ai_summary: summary })
        .eq("id", data.sessionId);
    }

    return {
      ok: true as const,
      sessionId: data.sessionId,
      endedAt,
      activeSec,
      pausedSec: totalPaused,
      summary: summary ?? null,
      lessonsCount: lessons.length,
      projectsCount: projects.length,
      gradesCount: grades.length,
    };
  });

// ---------- Today's report (for member dashboard) ----------
export const getTodaysSessionReport = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const { data: rows } = await supabaseAdmin
      .from("study_sessions")
      .select(
        "id, started_at, ended_at, active_seconds, paused_seconds, ai_summary, end_reason, status",
      )
      .eq("user_id", ctx.userId)
      .gte("started_at", startOfDay.toISOString())
      .order("started_at", { ascending: false });

    const sessions = rows ?? [];
    const totalActive = sessions.reduce((acc, s) => acc + (s.active_seconds ?? 0), 0);
    const totalPaused = sessions.reduce(
      (acc, s) => acc + ((s as any).paused_seconds ?? 0),
      0,
    );
    const latestEnded = sessions.find((s) => s.ended_at);

    return {
      ok: true as const,
      totalActiveSec: totalActive,
      totalPausedSec: totalPaused,
      sessionCount: sessions.length,
      latestSummary: (latestEnded as any)?.ai_summary ?? null,
      latestEndedAt: latestEnded?.ended_at ?? null,
      latestEndReason: (latestEnded as any)?.end_reason ?? null,
    };
  });

// ---------- Update expected daily hours ----------
export const updateExpectedDailyHours = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string; hours: number; accessToken?: string }) => d)
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role, franchise_id")
      .eq("user_id", ctx.userId);
    const roles = (callerRoles ?? []).map((r) => r.role as Role);
    const isCeo = roles.includes("ceo");
    const inchargeFranchise = (callerRoles ?? []).find((r) => r.role === "incharge")?.franchise_id;

    if (!isCeo) {
      const { data: target } = await supabaseAdmin
        .from("profiles")
        .select("franchise_id")
        .eq("id", data.userId)
        .maybeSingle();
      if (!inchargeFranchise || target?.franchise_id !== inchargeFranchise) {
        return { ok: false as const, error: "Not authorized" };
      }
    }

    const hours = Math.max(0, Math.min(24, Number(data.hours) || 0));
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ expected_daily_hours: hours })
      .eq("id", data.userId);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, hours };
  });
