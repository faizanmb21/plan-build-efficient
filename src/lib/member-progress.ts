// Member Progress data layer. Uses the browser Supabase client; relies on RLS
// so each role only sees the members they're allowed to. CEO sees all,
// incharge sees their franchise, member sees self.

import { supabase } from "@/integrations/supabase/client";
import { fetchCompletionSummary } from "@/lib/completion-summary";
import {
  buildAttendanceStrip,
  attendancePercent,
  type DayCell,
  type SessionLite,
} from "@/lib/attendance-utils";

export type RosterScope = "ceo" | "incharge";
export type ProgressStatus = "on_track" | "slipping" | "at_risk";

export interface RosterRow {
  userId: string;
  fullName: string;
  franchiseId: string | null;
  franchiseName: string | null;
  completionPct: number;
  hoursThisWeek: number; // hours, 1 decimal
  expectedDailyHours: number;
  targetHoursWeek: number; // expected * weekdays elapsed so far this week
  attendancePct14d: number;
  avgGrade: number | null; // 0-100
  pendingQa: number;
  paceDelta: number | null;
  status: ProgressStatus;
}

export interface SessionHistoryRow {
  id: string;
  startedAt: string;
  endedAt: string | null;
  activeSeconds: number;
  endReason: string | null;
}

export interface MemberDetail {
  userId: string;
  fullName: string;
  franchiseId: string | null;
  franchiseName: string | null;
  expectedDailyHours: number;
  workingDays: string[];
  targetHoursWeek: number;
  kpis: {
    completionPct: number;
    hoursThisWeek: number;
    hoursAllTime: number;
    attendancePct14d: number;
    avgGrade: number | null;
    pendingQa: number;
  };
  hoursByCourse: { courseId: string; title: string; hours: number }[];
  courses: {
    courseId: string;
    title: string;
    completionPct: number;
    done: number;
    total: number;
    avgGrade: number | null;
    pendingQa: number;
    deadline: string | null;
  }[];
  attendance14d: DayCell[];
  recentSessions: SessionHistoryRow[];
}


const DAY_MS = 86_400_000;

function statusFor(row: Omit<RosterRow, "status">): ProgressStatus {
  // At-risk thresholds
  if (
    row.attendancePct14d < 70 ||
    (row.paceDelta !== null && row.paceDelta < -40) ||
    row.pendingQa >= 4
  ) {
    return "at_risk";
  }
  // Slipping (amber)
  if (
    row.attendancePct14d < 85 ||
    (row.paceDelta !== null && row.paceDelta < -20) ||
    row.pendingQa >= 2 ||
    row.completionPct < 45
  ) {
    return "slipping";
  }
  return "on_track";
}

export async function fetchRoster(_scope: RosterScope): Promise<RosterRow[]> {
  // 1. profiles for visible members (RLS filters by role)
  // Pull all profiles, then filter to user_roles 'member'.
  const [{ data: roles }, { data: profiles }, { data: franchises }] = await Promise.all([
    supabase.from("user_roles").select("user_id, role").eq("role", "member"),
    supabase.from("profiles").select("id, full_name, franchise_id, expected_daily_hours"),
    supabase.from("franchises").select("id, name"),

  ]);

  const memberIds = new Set((roles ?? []).map((r) => r.user_id));
  const franchiseNameById = new Map((franchises ?? []).map((f) => [f.id, f.name]));
  const memberProfiles = (profiles ?? []).filter((p) => memberIds.has(p.id));
  const userIds = memberProfiles.map((p) => p.id);

  if (userIds.length === 0) return [];

  // 2. parallel data fetches
  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const since14d = new Date(Date.now() - 14 * DAY_MS).toISOString();

  const [
    completion,
    sessions7Res,
    sessions14Res,
    submissionsRes,
    projectSubsRes,
    assignmentsRes,
  ] = await Promise.all([
    fetchCompletionSummary({ userIds }),
    supabase
      .from("study_sessions")
      .select("user_id, active_seconds")
      .in("user_id", userIds)
      .gte("started_at", since7d),
    supabase
      .from("study_sessions")
      .select("user_id, started_at")
      .in("user_id", userIds)
      .gte("started_at", since14d),
    supabase
      .from("submissions")
      .select("user_id, status, grade")
      .in("user_id", userIds),
    supabase
      .from("project_submissions")
      .select("user_id, status, grade")
      .in("user_id", userIds),
    supabase
      .from("assignments")
      .select("user_id, course_id, created_at, deadline")
      .in("user_id", userIds),
  ]);

  // Hours this week
  const hoursThisWeek = new Map<string, number>();
  for (const s of sessions7Res.data ?? []) {
    hoursThisWeek.set(s.user_id, (hoursThisWeek.get(s.user_id) ?? 0) + (s.active_seconds ?? 0));
  }

  // 14d attendance
  const sessionsByUser = new Map<string, SessionLite[]>();
  for (const s of sessions14Res.data ?? []) {
    const arr = sessionsByUser.get(s.user_id) ?? [];
    arr.push({ started_at: s.started_at });
    sessionsByUser.set(s.user_id, arr);
  }

  // Avg grade & pending — combine lesson + project submissions so project
  // grades show up in the roster's Avg Grade column.
  const gradeSum = new Map<string, { sum: number; n: number }>();
  const pendingLessonByUser = new Map<string, number>();
  for (const s of submissionsRes.data ?? []) {
    if (s.status === "pending") {
      pendingLessonByUser.set(s.user_id, (pendingLessonByUser.get(s.user_id) ?? 0) + 1);
    } else if (s.grade != null) {
      const cur = gradeSum.get(s.user_id) ?? { sum: 0, n: 0 };
      cur.sum += s.grade;
      cur.n += 1;
      gradeSum.set(s.user_id, cur);
    }
  }
  const pendingProjectByUser = new Map<string, number>();
  for (const s of projectSubsRes.data ?? []) {
    if (s.status === "pending") {
      pendingProjectByUser.set(s.user_id, (pendingProjectByUser.get(s.user_id) ?? 0) + 1);
    } else if (s.grade != null) {
      const cur = gradeSum.get(s.user_id) ?? { sum: 0, n: 0 };
      cur.sum += s.grade;
      cur.n += 1;
      gradeSum.set(s.user_id, cur);
    }
  }

  // Pace: per assignment with deadline, expected pct = clamp((now-created)/(deadline-created)*100)
  // For each user, average the (actual - expected) deltas across their dated assignments.
  const paceDeltasByUser = new Map<string, number[]>();
  const now = Date.now();
  for (const a of assignmentsRes.data ?? []) {
    if (!a.deadline) continue;
    const start = new Date(a.created_at).getTime();
    const end = new Date(a.deadline).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const expected = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
    const actual =
      completion.byUser.get(a.user_id)?.byCourse.get(a.course_id)?.pct ?? 0;
    const arr = paceDeltasByUser.get(a.user_id) ?? [];
    arr.push(actual - expected);
    paceDeltasByUser.set(a.user_id, arr);
  }

  // Weekdays elapsed in the current rolling 7d window (cap at 5).
  const weekdaysElapsed = (() => {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() - i * DAY_MS);
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return Math.min(5, count);
  })();

  const rows: RosterRow[] = memberProfiles.map((p) => {
    const sec = hoursThisWeek.get(p.id) ?? 0;
    const hours = Math.round((sec / 3600) * 10) / 10;
    const cells = buildAttendanceStrip(sessionsByUser.get(p.id) ?? []);
    const attPct = attendancePercent(cells);
    const g = gradeSum.get(p.id);
    const avg = g && g.n > 0 ? Math.round(g.sum / g.n) : null;
    const pending =
      (pendingLessonByUser.get(p.id) ?? 0) + (pendingProjectByUser.get(p.id) ?? 0);
    const compPct = completion.byUser.get(p.id)?.overallPct ?? 0;
    const deltas = paceDeltasByUser.get(p.id) ?? [];
    const paceDelta =
      deltas.length > 0
        ? Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length)
        : null;
    const expectedDailyHours = Number((p as any).expected_daily_hours ?? 8);
    const targetHoursWeek = Math.round(expectedDailyHours * weekdaysElapsed * 10) / 10;

    const base = {
      userId: p.id,
      fullName: p.full_name ?? "Unnamed",
      franchiseId: p.franchise_id,
      franchiseName: p.franchise_id ? franchiseNameById.get(p.franchise_id) ?? null : null,
      completionPct: compPct,
      hoursThisWeek: hours,
      expectedDailyHours,
      targetHoursWeek,
      attendancePct14d: attPct,
      avgGrade: avg,
      pendingQa: pending,
      paceDelta,
    };
    return { ...base, status: statusFor(base) };
  });


  rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return rows;
}

export async function fetchMemberDetail(userId: string): Promise<MemberDetail | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, franchise_id, expected_daily_hours, working_days")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return null;


  const franchiseId = profile.franchise_id;
  let franchiseName: string | null = null;
  if (franchiseId) {
    const { data: f } = await supabase
      .from("franchises")
      .select("name")
      .eq("id", franchiseId)
      .maybeSingle();
    franchiseName = f?.name ?? null;
  }

  const since7d = new Date(Date.now() - 7 * DAY_MS).toISOString();
  const since14d = new Date(Date.now() - 14 * DAY_MS).toISOString();

  const [
    completion,
    sessAllRes,
    sess7Res,
    sess14Res,
    submissionsRes,
    projectSubsRes,
    assignmentsRes,
  ] = await Promise.all([
    fetchCompletionSummary({ userIds: [userId] }),
    supabase
      .from("study_sessions")
      .select("course_id, active_seconds")
      .eq("user_id", userId),
    supabase
      .from("study_sessions")
      .select("active_seconds")
      .eq("user_id", userId)
      .gte("started_at", since7d),
    supabase
      .from("study_sessions")
      .select("started_at")
      .eq("user_id", userId)
      .gte("started_at", since14d),
    supabase
      .from("submissions")
      .select("status, grade, lesson_id")
      .eq("user_id", userId),
    supabase
      .from("project_submissions")
      .select("status, grade")
      .eq("user_id", userId),
    supabase
      .from("assignments")
      .select("course_id, deadline")
      .eq("user_id", userId),
  ]);

  // hours by course
  const secByCourse = new Map<string, number>();
  let hoursAllSec = 0;
  for (const s of sessAllRes.data ?? []) {
    hoursAllSec += s.active_seconds ?? 0;
    if (s.course_id) {
      secByCourse.set(s.course_id, (secByCourse.get(s.course_id) ?? 0) + (s.active_seconds ?? 0));
    }
  }
  let hoursWeekSec = 0;
  for (const s of sess7Res.data ?? []) hoursWeekSec += s.active_seconds ?? 0;

  const cells = buildAttendanceStrip(
    (sess14Res.data ?? []).map((s) => ({ started_at: s.started_at })),
  );
  const attPct = attendancePercent(cells);

  let gSum = 0,
    gN = 0;
  let pendingLesson = 0;
  for (const s of submissionsRes.data ?? []) {
    if (s.status === "pending") pendingLesson++;
    else if (s.grade != null) {
      gSum += s.grade;
      gN += 1;
    }
  }
  let pendingProj = 0;
  for (const s of projectSubsRes.data ?? []) {
    if (s.status === "pending") pendingProj++;
    else if (s.grade != null) {
      gSum += s.grade;
      gN += 1;
    }
  }
  const pending = pendingLesson + pendingProj;
  const avgGrade = gN > 0 ? Math.round(gSum / gN) : null;

  const uSum = completion.byUser.get(userId);
  const titles = completion.courseTitles;
  const deadlineByCourse = new Map<string, string | null>();
  for (const a of assignmentsRes.data ?? []) {
    deadlineByCourse.set(a.course_id, a.deadline ?? null);
  }

  // per-course grades & pending: derive from submissions, need lesson→course map
  // pull lesson→section→course mapping for lessons in submissions
  const lessonIds = (submissionsRes.data ?? []).map((s) => s.lesson_id);
  const lessonToCourse = new Map<string, string>();
  if (lessonIds.length > 0) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, section_id")
      .in("id", lessonIds);
    const sectionIds = (lessons ?? []).map((l) => l.section_id);
    const { data: secs } = sectionIds.length
      ? await supabase.from("sections").select("id, course_id").in("id", sectionIds)
      : { data: [] as { id: string; course_id: string }[] };
    const secToCourse = new Map((secs ?? []).map((s) => [s.id, s.course_id]));
    for (const l of lessons ?? []) {
      const c = secToCourse.get(l.section_id);
      if (c) lessonToCourse.set(l.id, c);
    }
  }
  const courseGrade = new Map<string, { sum: number; n: number }>();
  const coursePending = new Map<string, number>();
  for (const s of submissionsRes.data ?? []) {
    const cid = lessonToCourse.get(s.lesson_id);
    if (!cid) continue;
    if (s.status === "pending") {
      coursePending.set(cid, (coursePending.get(cid) ?? 0) + 1);
    } else if (s.grade != null) {
      const cur = courseGrade.get(cid) ?? { sum: 0, n: 0 };
      cur.sum += s.grade;
      cur.n += 1;
      courseGrade.set(cid, cur);
    }
  }

  const courses = Array.from(uSum?.byCourse.entries() ?? []).map(([cid, c]) => {
    const g = courseGrade.get(cid);
    return {
      courseId: cid,
      title: titles.get(cid) ?? "Untitled",
      completionPct: c.pct,
      done: c.done,
      total: c.total,
      avgGrade: g && g.n > 0 ? Math.round(g.sum / g.n) : null,
      pendingQa: coursePending.get(cid) ?? 0,
      deadline: deadlineByCourse.get(cid) ?? null,
    };
  });
  courses.sort((a, b) => b.completionPct - a.completionPct);

  const hoursByCourse = Array.from(secByCourse.entries())
    .map(([cid, sec]) => ({
      courseId: cid,
      title: titles.get(cid) ?? "Untitled",
      hours: Math.round((sec / 3600) * 10) / 10,
    }))
    .sort((a, b) => b.hours - a.hours);

  // Recent sessions w/ AI summary
  const { data: sessRecent } = await supabase
    .from("study_sessions")
    .select("id, started_at, ended_at, active_seconds, end_reason")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(20);
  const recentSessions: SessionHistoryRow[] = (sessRecent ?? []).map((s: any) => ({
    id: s.id,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    activeSeconds: s.active_seconds ?? 0,
    endReason: s.end_reason,
  }));

  const expectedDailyHours = Number((profile as any).expected_daily_hours ?? 8);
  const workingDays: string[] = (profile as any).working_days ?? ["mon","tue","wed","thu","fri"];
  let weekdays = 0;
  for (let i = 0; i < 7; i++) {
    const day = new Date(Date.now() - i * DAY_MS).getDay();
    if (day !== 0 && day !== 6) weekdays++;
  }
  const targetHoursWeek = Math.round(expectedDailyHours * Math.min(5, weekdays) * 10) / 10;

  return {
    userId,
    fullName: profile.full_name ?? "Unnamed",
    franchiseId,
    franchiseName,
    expectedDailyHours,
    workingDays,
    targetHoursWeek,
    kpis: {
      completionPct: uSum?.overallPct ?? 0,
      hoursThisWeek: Math.round((hoursWeekSec / 3600) * 10) / 10,
      hoursAllTime: Math.round((hoursAllSec / 3600) * 10) / 10,
      attendancePct14d: attPct,
      avgGrade,
      pendingQa: pending,
    },
    hoursByCourse,
    courses,
    attendance14d: cells,
    recentSessions,
  };
}


export function completionColor(pct: number): "green" | "amber" | "red" {
  if (pct >= 70) return "green";
  if (pct >= 45) return "amber";
  return "red";
}

export function statusLabel(s: ProgressStatus): string {
  return s === "on_track" ? "On track" : s === "slipping" ? "Slipping" : "At risk";
}

export function statusBadgeClass(s: ProgressStatus): string {
  return s === "on_track"
    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
    : s === "slipping"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : "bg-rose-500/15 text-rose-300 border-rose-500/30";
}
