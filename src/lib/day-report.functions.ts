import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import {
  buildDayReportUserPrompt,
  DAY_REPORT_SYSTEM_PROMPT,
} from "@/lib/day-report-prompt";
import type {
  DayReportCourse,
  DayReportLessonCompleted,
  DayReportPayload,
  DayReportSubmission,
  DayStatus,
  LateSeverity,
} from "@/lib/day-report-types";

const PKT_TZ = "Asia/Karachi";
const DEFAULT_WORK_START_PKT = "10:00:00";
const LATE_GRACE_MIN = 5;
const VERY_LATE_THRESHOLD_MIN = 60;
const DAY_MS = 86_400_000;

// ---------- Auth helper (mirrors work-session.functions.ts) ----------

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

// ---------- PKT date helpers ----------

function pktDateParts(d: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA emits YYYY-MM-DD
  const s = fmt.format(d);
  const [y, m, day] = s.split("-").map((n) => parseInt(n, 10));
  return { year: y, month: m, day };
}

function pktDateString(d: Date): string {
  const { year, month, day } = pktDateParts(d);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Start of PKT day as a UTC ISO string. PKT is UTC+5, no DST.
function pktDayStartUtcIso(reportDate: string): string {
  // reportDate "YYYY-MM-DD" interpreted as midnight PKT, which is 19:00 the
  // prior day in UTC.
  const [y, m, d] = reportDate.split("-").map((n) => parseInt(n, 10));
  // Date.UTC(y, m-1, d) = midnight UTC. Subtract 5 hours to get midnight PKT.
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 5 * 3600_000;
  return new Date(utcMs).toISOString();
}

function pktDayEndUtcIso(reportDate: string): string {
  return new Date(
    new Date(pktDayStartUtcIso(reportDate)).getTime() + DAY_MS - 1,
  ).toISOString();
}

function formatPktClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PKT_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatWorkStartClock(workStart: string): string {
  // workStart is "HH:MM:SS"
  const [h, m] = workStart.split(":").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(date);
}

// Minutes between a UTC ISO instant and the same PKT-day's work_start_time.
// Positive = clock-in is after work_start_time.
function minutesLateInPkt(startedAtIso: string, workStartTime: string): number {
  const started = new Date(startedAtIso);
  const { year, month, day } = pktDateParts(started);
  const [h, m, s] = workStartTime.split(":").map((n) => parseInt(n, 10) || 0);
  // The scheduled start in UTC for the same PKT calendar day:
  // PKT = UTC+5, so PKT h:m:s on Y-M-D corresponds to (h-5):m:s UTC.
  const scheduledUtcMs = Date.UTC(year, month - 1, day, h, m, s) - 5 * 3600_000;
  const startedMs = started.getTime();
  return Math.round((startedMs - scheduledUtcMs) / 60_000);
}

function severityFor(lateMin: number): LateSeverity {
  if (lateMin <= LATE_GRACE_MIN) return "on_time";
  if (lateMin > VERY_LATE_THRESHOLD_MIN) return "very_late";
  return "late";
}

// Status classifier — mirrors statusFor in member-progress.ts but lighter
// (we only have today's signal at clock-out).
function classifyStatus(
  hoursThisWeek: number,
  targetHoursWeek: number,
): DayStatus {
  if (targetHoursWeek <= 0) return "on_track";
  const ratio = hoursThisWeek / targetHoursWeek;
  if (ratio < 0.6) return "at_risk";
  if (ratio < 0.85) return "slipping";
  return "on_track";
}

// ---------- Gemini call (same pattern as session AI summary) ----------

async function callGemini(systemPrompt: string, userPrompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn("GEMINI_API_KEY not set — skipping day report summary");
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
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.5, maxOutputTokens: 300 },
      }),
    });
    if (!res.ok) {
      console.warn("Gemini error", res.status, await res.text());
      return null;
    }
    const json: any = await res.json();
    const text = json?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text ?? "")
      .join("")
      .trim();
    return text || null;
  } catch (e) {
    console.warn("Gemini exception", e);
    return null;
  }
}

// ---------- Build the payload (deterministic part) ----------

async function buildPayload(userId: string, reportDate: string): Promise<DayReportPayload | null> {
  const dayStart = pktDayStartUtcIso(reportDate);
  const dayEnd = pktDayEndUtcIso(reportDate);

  // 1) Profile
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, franchise_id, expected_daily_hours, work_start_time")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;

  let franchiseName: string | null = null;
  if (profile.franchise_id) {
    const { data: f } = await supabaseAdmin
      .from("franchises")
      .select("name")
      .eq("id", profile.franchise_id)
      .maybeSingle();
    franchiseName = f?.name ?? null;
  }

  const workStartTime =
    ((profile as any).work_start_time as string | null) ?? DEFAULT_WORK_START_PKT;
  const expectedDailyHours = Number((profile as any).expected_daily_hours ?? 8);

  // 2) Sessions today (started_at within the PKT day)
  const { data: sessions } = await supabaseAdmin
    .from("study_sessions")
    .select("id, started_at, ended_at, active_seconds, course_id")
    .eq("user_id", userId)
    .gte("started_at", dayStart)
    .lte("started_at", dayEnd)
    .order("started_at", { ascending: true });

  const todaySessions = sessions ?? [];
  const activeSecToday = todaySessions.reduce(
    (acc, s) => acc + (s.active_seconds ?? 0),
    0,
  );
  const hoursToday = Math.round((activeSecToday / 3600) * 10) / 10;

  const firstStartedAt = todaySessions[0]?.started_at ?? null;
  const startedAtPkt = firstStartedAt ? formatPktClock(firstStartedAt) : null;
  const workStartTimePkt = formatWorkStartClock(workStartTime);

  let lateMinutesRaw = firstStartedAt
    ? minutesLateInPkt(firstStartedAt, workStartTime)
    : 0;
  // Apply grace
  const lateMinutes =
    lateMinutesRaw <= LATE_GRACE_MIN ? 0 : Math.max(0, lateMinutesRaw);
  const lateSeverity = severityFor(lateMinutesRaw);

  // 3) Hours this week — last 7 days (matches existing roster logic)
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const { data: weekSessions } = await supabaseAdmin
    .from("study_sessions")
    .select("active_seconds")
    .eq("user_id", userId)
    .gte("started_at", since7d);
  const weekSec = (weekSessions ?? []).reduce(
    (acc, s) => acc + (s.active_seconds ?? 0),
    0,
  );
  const hoursThisWeek = Math.round((weekSec / 3600) * 10) / 10;

  // Weekdays elapsed in the rolling 7d window (cap 5)
  const weekdaysElapsed = (() => {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * DAY_MS);
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return Math.min(5, count);
  })();
  const targetHoursWeek =
    Math.round(expectedDailyHours * weekdaysElapsed * 10) / 10;

  // 4) Lessons completed today
  const { data: lessonRows } = await supabaseAdmin
    .from("lesson_progress")
    .select("lesson_id, completed_at, lessons(id, title, section_id)")
    .eq("user_id", userId)
    .eq("completed", true)
    .gte("completed_at", dayStart)
    .lte("completed_at", dayEnd);

  const lessonsCompleted: DayReportLessonCompleted[] = (lessonRows ?? [])
    .map((r: any) => ({
      id: r.lessons?.id ?? r.lesson_id,
      title: r.lessons?.title ?? "Lesson",
    }))
    .filter((l) => l.id);

  // 5) Submissions today (lessons + projects)
  const [lessonSubsRes, projectSubsRes] = await Promise.all([
    supabaseAdmin
      .from("submissions")
      .select("id, status, grade, letter_grade, lesson_id, created_at, lessons(title)")
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd),
    supabaseAdmin
      .from("project_submissions")
      .select("id, status, grade, letter_grade, project_id, created_at, projects(title)")
      .eq("user_id", userId)
      .gte("created_at", dayStart)
      .lte("created_at", dayEnd),
  ]);

  const submissions: DayReportSubmission[] = [
    ...((lessonSubsRes.data ?? []).map((r: any) => ({
      id: r.id,
      title: r.lessons?.title ?? "Submission",
      kind: "lesson" as const,
      status: r.status as "pending" | "approved" | "revision",
      grade: r.grade ?? null,
      letterGrade: r.letter_grade ?? null,
    }))),
    ...((projectSubsRes.data ?? []).map((r: any) => ({
      id: r.id,
      title: r.projects?.title ?? "Project",
      kind: "project" as const,
      status: r.status as "pending" | "approved" | "revision",
      grade: r.grade ?? null,
      letterGrade: r.letter_grade ?? null,
    }))),
  ];

  // 6) Courses worked on today — group sessions by course_id, then look up
  //    course meta + the trainee's overall completion in that course.
  const courseSecToday = new Map<string, number>();
  for (const s of todaySessions) {
    if (!s.course_id) continue;
    courseSecToday.set(
      s.course_id,
      (courseSecToday.get(s.course_id) ?? 0) + (s.active_seconds ?? 0),
    );
  }
  const coursesWorkedOn: DayReportCourse[] = [];
  if (courseSecToday.size > 0) {
    const courseIds = Array.from(courseSecToday.keys());
    const [{ data: courses }, { data: sectionsRows }] = await Promise.all([
      supabaseAdmin.from("courses").select("id, title").in("id", courseIds),
      supabaseAdmin
        .from("sections")
        .select("id, course_id, lessons(id)")
        .in("course_id", courseIds),
    ]);
    const titleByCourse = new Map((courses ?? []).map((c) => [c.id, c.title]));

    // Build lesson_id -> course_id for completion counting
    const lessonIdToCourse = new Map<string, string>();
    const totalLessonsPerCourse = new Map<string, number>();
    for (const sec of (sectionsRows ?? []) as any[]) {
      const lessons = (sec.lessons ?? []) as { id: string }[];
      totalLessonsPerCourse.set(
        sec.course_id,
        (totalLessonsPerCourse.get(sec.course_id) ?? 0) + lessons.length,
      );
      for (const l of lessons) {
        lessonIdToCourse.set(l.id, sec.course_id);
      }
    }

    const allLessonIds = Array.from(lessonIdToCourse.keys());
    const { data: progressRows } = allLessonIds.length
      ? await supabaseAdmin
          .from("lesson_progress")
          .select("lesson_id, completed")
          .eq("user_id", userId)
          .in("lesson_id", allLessonIds)
      : { data: [] as { lesson_id: string; completed: boolean }[] };

    const doneByCourse = new Map<string, number>();
    for (const p of (progressRows ?? []) as any[]) {
      if (!p.completed) continue;
      const cid = lessonIdToCourse.get(p.lesson_id);
      if (cid) doneByCourse.set(cid, (doneByCourse.get(cid) ?? 0) + 1);
    }

    for (const [cid, sec] of courseSecToday.entries()) {
      const total = totalLessonsPerCourse.get(cid) ?? 0;
      const done = doneByCourse.get(cid) ?? 0;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      coursesWorkedOn.push({
        courseId: cid,
        title: titleByCourse.get(cid) ?? "Course",
        completionPct: pct,
        done,
        total,
        hoursToday: Math.round((sec / 3600) * 10) / 10,
      });
    }
    coursesWorkedOn.sort((a, b) => b.hoursToday - a.hoursToday);
  }

  const status = classifyStatus(hoursThisWeek, targetHoursWeek);

  const payload: DayReportPayload = {
    userId,
    fullName: profile.full_name ?? "Trainee",
    franchiseName,
    reportDate,
    hoursToday,
    hoursThisWeek,
    targetHoursWeek,
    startedAtPkt,
    workStartTimePkt,
    lateMinutes,
    lateSeverity,
    status,
    lessonsCompleted,
    submissions,
    coursesWorkedOn,
    aiSummary: null,
  };

  return payload;
}

// ---------- Server fns ----------

export const generateDayReport = createServerFn({ method: "POST" })
  .inputValidator((d: { accessToken?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const reportDate = pktDateString(new Date());

    const payload = await buildPayload(ctx.userId, reportDate);
    if (!payload) return { ok: false as const, error: "Profile not found" };

    // AI summary (best-effort; report still saves without it)
    const userPrompt = buildDayReportUserPrompt(payload);
    const aiSummary = await callGemini(DAY_REPORT_SYSTEM_PROMPT, userPrompt);
    if (aiSummary) payload.aiSummary = aiSummary;

    const { error } = await (supabaseAdmin.from as any)("day_reports")
      .upsert(
        {
          user_id: ctx.userId,
          report_date: reportDate,
          payload,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,report_date" },
      );
    if (error) return { ok: false as const, error: error.message };

    return { ok: true as const, payload };
  });

export const fetchDayReport = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { userId?: string; reportDate?: string; accessToken?: string }) => d ?? {},
  )
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const targetUserId = data.userId ?? ctx.userId;
    const targetDate = data.reportDate ?? pktDateString(new Date());

    // Authorization: caller is the user themselves, OR CEO, OR incharge of
    // the target's franchise. We piggyback on the same logic the table's
    // RLS uses, but we're in service-role land so we have to check manually.
    if (targetUserId !== ctx.userId) {
      const { data: callerRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role, franchise_id")
        .eq("user_id", ctx.userId);
      const roles = (callerRoles ?? []).map((r) => r.role as string);
      const isCeo = roles.includes("ceo");
      const inchargeFranchise = (callerRoles ?? []).find(
        (r) => r.role === "incharge",
      )?.franchise_id;
      let allowed = isCeo;
      if (!allowed && inchargeFranchise) {
        const { data: target } = await supabaseAdmin
          .from("profiles")
          .select("franchise_id")
          .eq("id", targetUserId)
          .maybeSingle();
        allowed = target?.franchise_id === inchargeFranchise;
      }
      if (!allowed) return { ok: false as const, error: "Not authorized" };
    }

    const { data: row } = (await (supabaseAdmin.from as any)("day_reports")
      .select("payload, generated_at, report_date")
      .eq("user_id", targetUserId)
      .eq("report_date", targetDate)
      .maybeSingle()) as { data: { payload: unknown; generated_at: string; report_date: string } | null };

    if (!row) return { ok: true as const, payload: null };
    return {
      ok: true as const,
      payload: row.payload as DayReportPayload,
      generatedAt: row.generated_at,
      reportDate: row.report_date,
    };
  });

export const listDayReports = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { userId?: string; limit?: number; accessToken?: string }) => d ?? {},
  )
  .handler(async ({ data }) => {
    const ctx = await getCaller(data?.accessToken);
    if (!ctx.ok) return { ok: false as const, error: ctx.error };

    const targetUserId = data.userId ?? ctx.userId;
    if (targetUserId !== ctx.userId) {
      const { data: callerRoles } = await supabaseAdmin
        .from("user_roles")
        .select("role, franchise_id")
        .eq("user_id", ctx.userId);
      const roles = (callerRoles ?? []).map((r) => r.role as string);
      const isCeo = roles.includes("ceo");
      const inchargeFranchise = (callerRoles ?? []).find(
        (r) => r.role === "incharge",
      )?.franchise_id;
      let allowed = isCeo;
      if (!allowed && inchargeFranchise) {
        const { data: target } = await supabaseAdmin
          .from("profiles")
          .select("franchise_id")
          .eq("id", targetUserId)
          .maybeSingle();
        allowed = target?.franchise_id === inchargeFranchise;
      }
      if (!allowed) return { ok: false as const, error: "Not authorized" };
    }

    const { data: rows } = (await (supabaseAdmin.from as any)("day_reports")
      .select("report_date, generated_at, payload")
      .eq("user_id", targetUserId)
      .order("report_date", { ascending: false })
      .limit(data.limit ?? 30)) as {
      data: { report_date: string; generated_at: string; payload: unknown }[] | null;
    };

    return {
      ok: true as const,
      reports: (rows ?? []).map((r) => ({
        reportDate: r.report_date,
        generatedAt: r.generated_at,
        payload: r.payload as DayReportPayload,
      })),
    };
  });
