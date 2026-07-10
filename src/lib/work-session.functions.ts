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

// ---------- Wall-clock accounting (server owns time) ----------
//
// Active time is ALWAYS derived from server timestamps:
//   active = (ended_at - started_at) - paused time (completed + in-flight)
// The client never ships accumulated seconds; browser throttling, tab
// freezing, or closing the tab cannot corrupt the clock.

// An open session whose last heartbeat is older than this is considered
// abandoned (tab closed / laptop shut). It gets finalized BACKDATED to the
// last heartbeat so nobody gains or loses hours.
const STALE_SESSION_MS = 30 * 60 * 1000;

interface SessionTimeRow {
  started_at: string;
  paused_seconds: number | null;
  paused_at: string | null;
}

function wallClockFigures(row: SessionTimeRow, endedAtIso: string) {
  const started = new Date(row.started_at).getTime();
  const ended = Math.max(started, new Date(endedAtIso).getTime());
  const inFlightPauseMs = row.paused_at
    ? Math.max(0, ended - new Date(row.paused_at).getTime())
    : 0;
  const pausedMs = Math.max(0, (row.paused_seconds ?? 0) * 1000) + inFlightPauseMs;
  const activeSec = Math.max(0, Math.round((ended - started - pausedMs) / 1000));
  const pausedSec = Math.round(pausedMs / 1000);
  return { activeSec, pausedSec };
}

async function finalizeSessionRow(
  sessionId: string,
  row: SessionTimeRow,
  endedAtIso: string,
  reason: EndReason,
) {
  const { activeSec, pausedSec } = wallClockFigures(row, endedAtIso);
  await supabaseAdmin
    .from("study_sessions")
    .update({
      ended_at: endedAtIso,
      active_seconds: activeSec,
      paused_seconds: pausedSec,
      end_reason: reason,
      status: "completed",
      paused_at: null,
    } as any)
    .eq("id", sessionId)
    .is("ended_at", null);
  return { activeSec, pausedSec };
}

type OpenSessionRow = SessionTimeRow & {
  id: string;
  status: string | null;
  last_heartbeat_at: string | null;
};

// Finalizes every abandoned open session for the user (backdated to its last
// heartbeat) and returns the still-fresh open session, if any.
async function sweepAndGetOpenSession(userId: string): Promise<{
  open: OpenSessionRow | null;
  recovered: boolean;
}> {
  const { data: rows } = await supabaseAdmin
    .from("study_sessions")
    .select("id, started_at, status, paused_at, paused_seconds, last_heartbeat_at")
    .eq("user_id", userId)
    .is("ended_at", null)
    .order("started_at", { ascending: false });

  let open: OpenSessionRow | null = null;
  let recovered = false;
  for (const row of (rows ?? []) as OpenSessionRow[]) {
    const lastBeat = row.last_heartbeat_at ?? row.started_at;
    const staleMs = Date.now() - new Date(lastBeat).getTime();
    if (staleMs > STALE_SESSION_MS) {
      await finalizeSessionRow(row.id, row, lastBeat, "auto_idle_global");
      recovered = true;
    } else if (!open) {
      open = row;
    } else {
      // Duplicate fresh open sessions shouldn't exist; close the older one at
      // its last heartbeat to keep the books clean.
      await finalizeSessionRow(row.id, row, lastBeat, "auto_idle_global");
    }
  }
  return { open, recovered };
}

// ---------- Clock in ----------
export const clockIn = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    // Reconcile zombies first, then adopt a still-fresh open session if any.
    const { open, recovered } = await sweepAndGetOpenSession(ctx.userId);
    if (open) {
      return {
        ok: true as const,
        sessionId: open.id,
        startedAt: open.started_at,
        status: (open.status ?? "active") as "active" | "paused",
        pausedAt: open.paused_at,
        pausedSeconds: open.paused_seconds ?? 0,
        recovered,
      };
    }

    const { data: row, error } = await supabaseAdmin
      .from("study_sessions")
      .insert({
        user_id: ctx.userId,
        client_info: { mode: "work" },
        status: "active",
        last_heartbeat_at: new Date().toISOString(),
      } as any)
      .select("id, started_at")
      .single();
    if (error || !row) return { ok: false as const, error: error?.message ?? "Failed" };
    return {
      ok: true as const,
      sessionId: row.id,
      startedAt: row.started_at,
      status: "active" as const,
      pausedAt: null as string | null,
      pausedSeconds: 0,
      recovered,
    };
  });

// ---------- Resume on page load ----------
// Called on member-app mount. Sweeps abandoned sessions (backdating their
// hours to the last heartbeat) and returns the live one to adopt, if any.
export const resumeOpenSession = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const { open, recovered } = await sweepAndGetOpenSession(ctx.userId);
    if (!open) return { ok: true as const, session: null, recovered };
    return {
      ok: true as const,
      recovered,
      session: {
        id: open.id,
        startedAt: open.started_at,
        status: (open.status ?? "active") as "active" | "paused",
        pausedAt: open.paused_at,
        pausedSeconds: open.paused_seconds ?? 0,
      },
    };
  });

// ---------- Heartbeat ----------
// Liveness ping. Also refreshes active_seconds from wall-clock so live views
// (attendance "today active") stay accurate. The client's deltaActiveSec is
// accepted for backward compatibility but IGNORED — the server owns time.
export const heartbeatSession = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { sessionId: string; deltaActiveSec?: number; accessToken?: string }) => d,
  )
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    const { data: cur } = await supabaseAdmin
      .from("study_sessions")
      .select("user_id, started_at, ended_at, status, paused_at, paused_seconds")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!cur || cur.user_id !== ctx.userId) return { ok: false as const, error: "Not found" };
    if (cur.ended_at) return { ok: false as const, error: "Already ended" };

    const nowIso = new Date().toISOString();
    const paused = (cur as any).status === "paused";
    // The extra .is("ended_at", null) guards against a frozen tab resuming a
    // suspended in-flight heartbeat hours later and stomping a row that was
    // finalized in the meantime (observed in production: last_heartbeat_at
    // hours AFTER ended_at).
    if (paused) {
      await supabaseAdmin
        .from("study_sessions")
        .update({ last_heartbeat_at: nowIso })
        .eq("id", data.sessionId)
        .is("ended_at", null);
      return { ok: true as const };
    }
    const { activeSec } = wallClockFigures(cur as SessionTimeRow, nowIso);
    await supabaseAdmin
      .from("study_sessions")
      .update({ active_seconds: activeSec, last_heartbeat_at: nowIso })
      .eq("id", data.sessionId)
      .is("ended_at", null);
    return { ok: true as const, activeSeconds: activeSec };
  });

// ---------- Pause ----------
export const pauseSession = createServerFn({ method: "POST" })
  .inputValidator((d: { sessionId: string; deltaActiveSec?: number; accessToken?: string }) => d)
  .handler(async ({ data }) => {
    const ctx = await getCaller(data.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };
    const { data: cur } = await supabaseAdmin
      .from("study_sessions")
      .select("user_id, started_at, ended_at, status, paused_at, paused_seconds")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (!cur || cur.user_id !== ctx.userId) return { ok: false as const, error: "Not found" };
    if (cur.ended_at) return { ok: false as const, error: "Already ended" };
    if ((cur as any).status === "paused") {
      return { ok: true as const, pausedAt: (cur as any).paused_at ?? new Date().toISOString() };
    }
    const nowIso = new Date().toISOString();
    // Freeze the wall-clock active figure at the pause moment.
    const { activeSec } = wallClockFigures(cur as unknown as SessionTimeRow, nowIso);
    const { error } = await supabaseAdmin
      .from("study_sessions")
      .update({
        active_seconds: activeSec,
        status: "paused",
        paused_at: nowIso,
        last_heartbeat_at: nowIso,
      } as any)
      .eq("id", data.sessionId)
      .is("ended_at", null);
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
      .eq("id", data.sessionId)
      .is("ended_at", null);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, pausedSeconds: nextPaused };
  });

// ---------- Clock out ----------
type EndReason = "manual" | "auto_idle_global" | "auto_idle_course";

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

    // KILL SWITCH: the idle auto-clock-out feature was removed from the app,
    // but trainees with stale cached bundles (tabs never reloaded since the
    // old deploy) still run the deleted 3-minute timer and call this with an
    // auto_idle reason. Refuse it server-side — their session keeps running —
    // and tell them how to get the fixed build. New clients only ever send
    // "manual".
    if (data.endReason && data.endReason !== "manual") {
      return {
        ok: false as const,
        error:
          "Auto clock-out has been removed — your clock is still running. Please refresh the app (Ctrl+Shift+R / Cmd+Shift+R) to get the update.",
      };
    }

    // Idempotent: a racing second clock-out (another tab, retry) returns the
    // stored figures instead of an error.
    if (cur.ended_at) {
      return {
        ok: true as const,
        sessionId: data.sessionId,
        endedAt: cur.ended_at,
        activeSec: cur.active_seconds ?? 0,
        pausedSec: (cur as any).paused_seconds ?? 0,
        alreadyEnded: true,
      };
    }

    // Server-authoritative: active = wall clock minus pauses. The client's
    // deltaActiveSec is ignored.
    const endedAt = new Date().toISOString();
    const { activeSec, pausedSec } = await finalizeSessionRow(
      data.sessionId,
      cur as unknown as SessionTimeRow,
      endedAt,
      data.endReason ?? "manual",
    );

    return {
      ok: true as const,
      sessionId: data.sessionId,
      endedAt,
      activeSec,
      pausedSec,
      alreadyEnded: false,
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
