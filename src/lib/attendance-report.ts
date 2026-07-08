// Monthly attendance + training report (ClassDojo-style report cards for
// trainees). One row per member for a PKT calendar month: day-by-day
// attendance classification plus performance (course completion standing,
// month grades via aggregateGrades) and training output.

import { supabase } from "@/integrations/supabase/client";
import { fetchCompletionSummary } from "@/lib/completion-summary";
import { aggregateGrades, type GradedRow } from "@/lib/grade-utils";

const PKT = "Asia/Karachi";
const LATE_GRACE_MIN = 5;
const VERY_LATE_MIN = 60;

export type ReportDayStatus = "present" | "late" | "very_late" | "absent" | "off" | "future";

export interface ReportDay {
  /** YYYY-MM-DD (PKT calendar date) */
  date: string;
  dow: string;
  status: ReportDayStatus;
  lateMinutes: number;
  activeSec: number;
  firstStartIso: string | null;
}

export interface ReportCourse {
  courseId: string;
  title: string;
  pct: number;
  done: number;
  total: number;
}

export interface MemberMonthReport {
  userId: string;
  fullName: string;
  expectedDailyHours: number;
  workStartTime: string;
  workingDayCount: number;
  presentDays: number; // on-time + late (they showed up)
  onTimeDays: number;
  lateDays: number;
  absentDays: number;
  attendancePct: number; // showed-up / working days elapsed
  punctualityPct: number; // on-time / showed-up
  activeSec: number;
  targetSec: number;
  hoursPct: number;
  lessonsCompleted: number;
  // Performance
  completionPct: number; // overall course completion standing (cumulative)
  courses: ReportCourse[]; // per assigned course standing
  submissionsCount: number; // month submissions (lesson + project, incl pending)
  gradedCount: number; // month submissions that were graded
  gradePending: number;
  gradeAvgPct: number; // 0-100 average of graded work this month
  gradePassRate: number; // 0-100
  days: ReportDay[];
}

// ---------- PKT date helpers ----------

function pktDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Current month in PKT as "YYYY-MM". */
export function pktMonthKey(d: Date = new Date()): string {
  return pktDateKey(d).slice(0, 7);
}

export function shiftMonth(monthKey: string, by: number): string {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  const total = y * 12 + (m - 1) + by;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** PKT day start expressed in UTC ISO. PKT = UTC+5, no DST. */
function pktDayStartUtcIso(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d) - 5 * 3600_000).toISOString();
}

function minutesLatePkt(startedAtIso: string, dateKey: string, workStartTime: string): number {
  const [y, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
  const [h, min, s] = workStartTime.split(":").map((n) => parseInt(n, 10) || 0);
  const scheduledUtcMs = Date.UTC(y, m - 1, d, h, min, s) - 5 * 3600_000;
  return Math.round((new Date(startedAtIso).getTime() - scheduledUtcMs) / 60_000);
}

// ---------- Loader ----------

export async function loadMonthlyReport({
  franchiseId,
  monthKey,
}: {
  franchiseId: string | null;
  monthKey: string;
}): Promise<MemberMonthReport[]> {
  // Members in scope (RLS also enforces server-side)
  const profileQuery = supabase
    .from("profiles")
    .select(
      "id, full_name, work_start_time, working_days, expected_daily_hours, franchise_id",
    );
  const { data: profilesRes } = franchiseId
    ? await profileQuery.eq("franchise_id", franchiseId)
    : await profileQuery;
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("role", "member");
  const memberIds = new Set((roleRows ?? []).map((r) => r.user_id));
  const members = (profilesRes ?? []).filter((p) => memberIds.has(p.id));
  if (members.length === 0) return [];
  const ids = members.map((m) => m.id);

  // Month range in UTC
  const nDays = daysInMonth(monthKey);
  const dayKeys = Array.from(
    { length: nDays },
    (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`,
  );
  const rangeStart = pktDayStartUtcIso(dayKeys[0]);
  const rangeEnd = new Date(
    new Date(pktDayStartUtcIso(dayKeys[nDays - 1])).getTime() + 24 * 3600_000 - 1,
  ).toISOString();

  const [sessionsRes, lessonsRes, subsRes, projSubsRes, completion] = await Promise.all([
    supabase
      .from("study_sessions")
      .select("user_id, started_at, active_seconds")
      .in("user_id", ids)
      .gte("started_at", rangeStart)
      .lte("started_at", rangeEnd),
    supabase
      .from("lesson_progress")
      .select("user_id, completed_at")
      .in("user_id", ids)
      .eq("completed", true)
      .gte("completed_at", rangeStart)
      .lte("completed_at", rangeEnd),
    supabase
      .from("submissions")
      .select("id, user_id, created_at, grade, letter_grade, status")
      .in("user_id", ids)
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd),
    supabase
      .from("project_submissions")
      .select("id, user_id, created_at, grade, letter_grade, status")
      .in("user_id", ids)
      .gte("created_at", rangeStart)
      .lte("created_at", rangeEnd),
    // Course completion is the member's CURRENT overall standing (cumulative),
    // not month-scoped — that's what "completion" means on a report card.
    fetchCompletionSummary({ userIds: ids }),
  ]);

  // Group sessions per user per PKT day
  const byUserDay = new Map<string, Map<string, { activeSec: number; first: string | null }>>();
  for (const s of sessionsRes.data ?? []) {
    const key = pktDateKey(new Date(s.started_at));
    let userMap = byUserDay.get(s.user_id);
    if (!userMap) {
      userMap = new Map();
      byUserDay.set(s.user_id, userMap);
    }
    const cell = userMap.get(key) ?? { activeSec: 0, first: null };
    cell.activeSec += s.active_seconds ?? 0;
    if (!cell.first || s.started_at < cell.first) cell.first = s.started_at;
    userMap.set(key, cell);
  }

  const lessonsByUser = new Map<string, number>();
  for (const l of lessonsRes.data ?? []) {
    lessonsByUser.set(l.user_id, (lessonsByUser.get(l.user_id) ?? 0) + 1);
  }

  // Month grade rows (lesson + project submissions) per user, in the
  // GradedRow shape aggregateGrades expects.
  const gradeRowsByUser = new Map<string, GradedRow[]>();
  const pushRow = (r: any, source: "lesson" | "project") => {
    const arr = gradeRowsByUser.get(r.user_id) ?? [];
    arr.push({
      id: r.id,
      user_id: r.user_id,
      lesson_id: null,
      project_id: null,
      source,
      status: r.status,
      letter_grade: r.letter_grade ?? null,
      grade: r.grade ?? null,
      feedback: null,
      created_at: r.created_at,
      reviewed_at: null,
      reviewed_by: null,
    });
    gradeRowsByUser.set(r.user_id, arr);
  };
  for (const s of subsRes.data ?? []) pushRow(s, "lesson");
  for (const s of projSubsRes.data ?? []) pushRow(s, "project");

  const todayKey = pktDateKey(new Date());

  const reports: MemberMonthReport[] = members.map((p) => {
    const workStartTime = (p as any).work_start_time ?? "10:00:00";
    const workingDays: string[] = (p as any).working_days?.length
      ? (p as any).working_days
      : ["mon", "tue", "wed", "thu", "fri"];
    const expectedDailyHours = Number((p as any).expected_daily_hours ?? 8);
    const userMap = byUserDay.get(p.id) ?? new Map();

    const days: ReportDay[] = dayKeys.map((dateKey) => {
      const [y, m, d] = dateKey.split("-").map((n) => parseInt(n, 10));
      const dowIdx = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
      const dow = DOW[dowIdx];
      const isWorkingDay = workingDays.includes(dow.toLowerCase());
      const cell = userMap.get(dateKey);

      let status: ReportDayStatus;
      let lateMinutes = 0;
      if (!isWorkingDay) status = "off";
      else if (dateKey > todayKey) status = "future";
      else if (!cell) status = "absent";
      else {
        const minLate = cell.first
          ? minutesLatePkt(cell.first, dateKey, workStartTime)
          : 0;
        if (minLate <= LATE_GRACE_MIN) status = "present";
        else if (minLate > VERY_LATE_MIN) {
          status = "very_late";
          lateMinutes = minLate;
        } else {
          status = "late";
          lateMinutes = minLate;
        }
      }
      return {
        date: dateKey,
        dow,
        status,
        lateMinutes,
        activeSec: cell?.activeSec ?? 0,
        firstStartIso: cell?.first ?? null,
      };
    });

    const elapsed = days.filter((d) => d.status !== "off" && d.status !== "future");
    const onTimeDays = elapsed.filter((d) => d.status === "present").length;
    const lateDays = elapsed.filter(
      (d) => d.status === "late" || d.status === "very_late",
    ).length;
    const absentDays = elapsed.filter((d) => d.status === "absent").length;
    const presentDays = onTimeDays + lateDays;
    const workingDayCount = elapsed.length;
    const attendancePct =
      workingDayCount > 0 ? Math.round((presentDays / workingDayCount) * 100) : 0;
    const punctualityPct =
      presentDays > 0 ? Math.round((onTimeDays / presentDays) * 100) : 0;

    const activeSec = days.reduce((a, d) => a + d.activeSec, 0);
    const targetSec = workingDayCount * expectedDailyHours * 3600;
    const hoursPct = targetSec > 0 ? Math.round((activeSec / targetSec) * 100) : 0;

    const gradeRows = gradeRowsByUser.get(p.id) ?? [];
    const agg = aggregateGrades(gradeRows);

    const uSum = completion.byUser.get(p.id);
    const courses: ReportCourse[] = Array.from(uSum?.byCourse.values() ?? [])
      .map((c) => ({
        courseId: c.courseId,
        title: completion.courseTitles.get(c.courseId) ?? "Course",
        pct: c.pct,
        done: c.done,
        total: c.total,
      }))
      .sort((a, b) => b.pct - a.pct);

    return {
      userId: p.id,
      fullName: p.full_name ?? "Member",
      expectedDailyHours,
      workStartTime,
      workingDayCount,
      presentDays,
      onTimeDays,
      lateDays,
      absentDays,
      attendancePct,
      punctualityPct,
      activeSec,
      targetSec,
      hoursPct,
      lessonsCompleted: lessonsByUser.get(p.id) ?? 0,
      completionPct: uSum?.overallPct ?? 0,
      courses,
      submissionsCount: gradeRows.length,
      gradedCount: agg.total,
      gradePending: agg.pending,
      gradeAvgPct: agg.averagePercent,
      gradePassRate: agg.passRate,
      days,
    };
  });

  reports.sort((a, b) => b.attendancePct - a.attendancePct || a.fullName.localeCompare(b.fullName));
  return reports;
}

/** First clock-in shown as PKT wall-clock time, e.g. "10:24 AM". */
export function formatPktClockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PKT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
