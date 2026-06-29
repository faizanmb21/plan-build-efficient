// Builds a Jibble-style weekly timesheet: for each member × each day in the
// week, classifies attendance (present / late / absent / off) and tallies
// hours from study_sessions. Pulled into AttendanceTimesheet.tsx.

import { supabase } from "@/integrations/supabase/client";

const PKT = "Asia/Karachi";
const DAY_MS = 86_400_000;
const LATE_GRACE_MIN = 5;
const VERY_LATE_MIN = 60;
const LIVE_STALE_MS = 10 * 60 * 1000;

export type DayState = "present" | "late" | "very_late" | "absent" | "off" | "future";

export interface DayCell {
  /** YYYY-MM-DD in PKT */
  date: string;
  /** weekday short in PKT (Mon/Tue/...) */
  dow: string;
  state: DayState;
  /** ISO of earliest clock-in that PKT day, if any */
  firstStartIso: string | null;
  /** ISO of latest clock-out that PKT day, if any (may be null if still live) */
  lastEndIso: string | null;
  activeSec: number;
  idleSec: number;
  sessionCount: number;
  /** Minutes past work_start_time grace; 0 if on-time or absent */
  lateMinutes: number;
  /** True if any session that day is still open and recent heartbeat */
  live: boolean;
}

export interface MemberRow {
  userId: string;
  fullName: string;
  workStartTime: string;        // "HH:MM:SS"
  workEndTime: string | null;   // "HH:MM:SS"
  workingDays: string[];        // ["mon","tue",...]
  expectedDailyHours: number;
  days: DayCell[];              // length 7, Mon→Sun
  totalActiveSec: number;
  totalTargetSec: number;
  attendancePct: number;
  lateCount: number;
  absentCount: number;
}

export interface SessionLite {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number | null;
  idle_seconds: number | null;
  last_heartbeat_at: string | null;
  status: string | null;
  end_reason: string | null;
  course_id: string | null;
}

// ---------- PKT helpers ----------

function pktParts(d: Date): { y: number; m: number; day: number; weekday: string; hour: number; min: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
    weekday: "short",
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    y: parseInt(parts.year, 10),
    m: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    weekday: parts.weekday,
    hour: parseInt(parts.hour, 10),
    min: parseInt(parts.minute, 10),
  };
}

function pktDateKey(d: Date): string {
  const p = pktParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Start of PKT day as a UTC ISO string. PKT = UTC+5, no DST. */
function pktDayStartUtcIso(reportDate: string): string {
  const [y, m, d] = reportDate.split("-").map((n) => parseInt(n, 10));
  const utcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 5 * 3600_000;
  return new Date(utcMs).toISOString();
}

/** Monday of the PKT week containing `d` as a YYYY-MM-DD string. */
export function pktWeekStartKey(d: Date): string {
  const p = pktParts(d);
  // JS getDay: 0=Sun,1=Mon,...,6=Sat. Convert PKT weekday string.
  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const idx = dows.indexOf(p.weekday);
  const offsetFromMonday = idx === 0 ? 6 : idx - 1;
  const utcStart = Date.UTC(p.y, p.m - 1, p.day) - 5 * 3600_000;
  const mondayUtcMs = utcStart - offsetFromMonday * DAY_MS;
  return pktDateKey(new Date(mondayUtcMs));
}

export function shiftWeek(weekStartKey: string, weeks: number): string {
  const [y, m, d] = weekStartKey.split("-").map((n) => parseInt(n, 10));
  const utcStart = Date.UTC(y, m - 1, d) - 5 * 3600_000;
  return pktDateKey(new Date(utcStart + weeks * 7 * DAY_MS));
}

/** Returns [Mon..Sun] as PKT date keys (YYYY-MM-DD). */
function weekDayKeys(weekStartKey: string): string[] {
  const [y, m, d] = weekStartKey.split("-").map((n) => parseInt(n, 10));
  const startUtc = Date.UTC(y, m - 1, d) - 5 * 3600_000;
  return Array.from({ length: 7 }, (_, i) => pktDateKey(new Date(startUtc + i * DAY_MS)));
}

const WEEKDAY_LABEL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function minutesLatePkt(startedAtIso: string, workStartTime: string): number {
  const started = new Date(startedAtIso);
  const p = pktParts(started);
  const [h, m, s] = workStartTime.split(":").map((n) => parseInt(n, 10) || 0);
  const scheduledUtcMs = Date.UTC(p.y, p.m - 1, p.day, h, m, s) - 5 * 3600_000;
  return Math.round((started.getTime() - scheduledUtcMs) / 60_000);
}

// ---------- Fetch + classify ----------

interface ProfileRow {
  id: string;
  full_name: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  working_days: string[] | null;
  expected_daily_hours: number | null;
}

export async function loadTimesheet({
  franchiseId,
  weekStartKey,
}: {
  franchiseId: string | null;
  weekStartKey: string;
}): Promise<MemberRow[]> {
  // 1. Profiles (only members in franchise, if scoped)
  const profileQuery = supabase
    .from("profiles")
    .select(
      "id, full_name, work_start_time, work_end_time, working_days, expected_daily_hours, franchise_id",
    );
  const { data: profilesRes } = franchiseId
    ? await profileQuery.eq("franchise_id", franchiseId)
    : await profileQuery;
  const profiles = (profilesRes ?? []) as (ProfileRow & { franchise_id: string | null })[];

  // 2. Only members (role = 'member')
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .eq("role", "member");
  const memberIds = new Set((roleRows ?? []).map((r) => r.user_id));
  const memberProfiles = profiles.filter((p) => memberIds.has(p.id));
  if (memberProfiles.length === 0) return [];

  // 3. Sessions for those members, scoped to the week
  const dayKeys = weekDayKeys(weekStartKey);
  const rangeStartIso = pktDayStartUtcIso(dayKeys[0]);
  const rangeEndIso = new Date(
    new Date(pktDayStartUtcIso(dayKeys[6])).getTime() + DAY_MS - 1,
  ).toISOString();

  const { data: sessionsRes } = await supabase
    .from("study_sessions")
    .select(
      "id, user_id, started_at, ended_at, active_seconds, idle_seconds, last_heartbeat_at, status, end_reason, course_id",
    )
    .in(
      "user_id",
      memberProfiles.map((p) => p.id),
    )
    .gte("started_at", rangeStartIso)
    .lte("started_at", rangeEndIso);
  const sessions = (sessionsRes ?? []) as SessionLite[];

  // 4. Group sessions per user per day
  const grouped = new Map<string, Map<string, SessionLite[]>>();
  for (const s of sessions) {
    const key = pktDateKey(new Date(s.started_at));
    let userMap = grouped.get(s.user_id);
    if (!userMap) {
      userMap = new Map();
      grouped.set(s.user_id, userMap);
    }
    const arr = userMap.get(key) ?? [];
    arr.push(s);
    userMap.set(key, arr);
  }

  // 5. Today's PKT key (for "future" classification)
  const todayKey = pktDateKey(new Date());

  // 6. Build rows
  const rows: MemberRow[] = memberProfiles.map((p) => {
    const workStartTime = p.work_start_time ?? "10:00:00";
    const workingDays = p.working_days?.length
      ? p.working_days
      : ["mon", "tue", "wed", "thu", "fri"];
    const expectedDailyHours = Number(p.expected_daily_hours ?? 8);
    const userMap = grouped.get(p.id) ?? new Map<string, SessionLite[]>();

    const days: DayCell[] = dayKeys.map((dayKey, idx) => {
      const dayLabel = WEEKDAY_LABEL[idx];
      const dayLower = dayLabel.toLowerCase();
      const isWorkingDay = workingDays.includes(dayLower);
      const isFuture = dayKey > todayKey;

      const dailySessions = userMap.get(dayKey) ?? [];
      const activeSec = dailySessions.reduce((a, s) => a + (s.active_seconds ?? 0), 0);
      const idleSec = dailySessions.reduce((a, s) => a + (s.idle_seconds ?? 0), 0);

      let firstStart: string | null = null;
      let lastEnd: string | null = null;
      let live = false;
      for (const s of dailySessions) {
        if (!firstStart || s.started_at < firstStart) firstStart = s.started_at;
        if (s.ended_at && (!lastEnd || s.ended_at > lastEnd)) lastEnd = s.ended_at;
        const lh = s.last_heartbeat_at ?? s.started_at;
        const fresh = lh ? Date.now() - new Date(lh).getTime() < LIVE_STALE_MS : false;
        if (!s.ended_at && s.status !== "completed" && fresh) live = true;
      }

      let state: DayState;
      let lateMinutes = 0;
      if (!isWorkingDay) {
        state = "off";
      } else if (isFuture) {
        state = "future";
      } else if (dailySessions.length === 0) {
        state = "absent";
      } else if (firstStart) {
        const minLate = minutesLatePkt(firstStart, workStartTime);
        if (minLate <= LATE_GRACE_MIN) {
          state = "present";
        } else if (minLate > VERY_LATE_MIN) {
          state = "very_late";
          lateMinutes = minLate;
        } else {
          state = "late";
          lateMinutes = minLate;
        }
      } else {
        state = "present";
      }

      return {
        date: dayKey,
        dow: dayLabel,
        state,
        firstStartIso: firstStart,
        lastEndIso: lastEnd,
        activeSec,
        idleSec,
        sessionCount: dailySessions.length,
        lateMinutes,
        live,
      };
    });

    const workingDayCount = days.filter((d) => d.state !== "off" && d.state !== "future").length;
    const presentCount = days.filter(
      (d) => d.state === "present" || d.state === "late" || d.state === "very_late",
    ).length;
    const attendancePct = workingDayCount > 0 ? Math.round((presentCount / workingDayCount) * 100) : 0;
    const lateCount = days.filter((d) => d.state === "late" || d.state === "very_late").length;
    const absentCount = days.filter((d) => d.state === "absent").length;

    const totalActiveSec = days.reduce((a, d) => a + d.activeSec, 0);
    const totalTargetSec = workingDayCount * expectedDailyHours * 3600;

    return {
      userId: p.id,
      fullName: p.full_name ?? "Member",
      workStartTime,
      workEndTime: p.work_end_time,
      workingDays,
      expectedDailyHours,
      days,
      totalActiveSec,
      totalTargetSec,
      attendancePct,
      lateCount,
      absentCount,
    };
  });

  rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
  return rows;
}

export function formatWeekRange(weekStartKey: string): string {
  const [y, m, d] = weekStartKey.split("-").map((n) => parseInt(n, 10));
  const start = new Date(Date.UTC(y, m - 1, d));
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const fmt = (dt: Date) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(dt);
  return `${fmt(start)} – ${fmt(end)}, ${y}`;
}

export function formatPktClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PKT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function formatWorkStartClock(workStart: string): string {
  const [h, m] = workStart.split(":").map((n) => parseInt(n, 10));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}
