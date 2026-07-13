// Data for the CEO "Members Live Board" — one dense card per member with
// live-session status, KPIs and risk flags, plus the top summary strip.
// All times are PKT calendar days, matching the attendance/report modules.

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompletionSummary } from "@/lib/completion-summary";
import { aggregateGrades, type GradedRow } from "@/lib/grade-utils";
import { fetchAllGradedRowsVisible } from "@/lib/all-grades";

const PKT = "Asia/Karachi";
const DAY_MS = 86_400_000;
const LIVE_STALE_MS = 10 * 60 * 1000;
const LATE_GRACE_MIN = 5;

export type LiveStatus = "live" | "paused" | "offline" | "off_day";

export interface LiveMember {
  userId: string;
  fullName: string;
  franchiseName: string | null;
  initials: string;
  // Header
  overallPct: number;
  status: LiveStatus;
  liveElapsedSec: number | null;
  liveStartedAtMs: number | null;
  currentLessonTitle: string | null;
  lateInPkt: string | null; // "10:24 AM" when first session today was late
  lastEndPkt: string | null; // last session end (for offline chip)
  actualStartPkt: string | null; // first session today's clock time, whether on-time or late
  scheduledStartPkt: string; // work_start_time configured for this member, always present
  atRisk: boolean;
  riskReasons: string[];
  // KPI tiles
  hoursWeekSec: number;
  weekTargetSec: number;
  attendPct: number;
  gradeLetter: string | null;
  gradeAvgPct: number | null;
  // strip helpers
  hoursTodaySec: number;
  presentToday: boolean;
}

export interface LiveBoard {
  members: LiveMember[];
  presentToday: number;
  totalMembers: number;
  workingNow: number;
  hoursTodaySec: number;
  dailyTargetSecSum: number;
  pendingReview: number;
  // Banner breakdown (all "today", PKT calendar day)
  presentOnTime: number; // had a session today, first one not late
  presentLate: number; // had a session today, first one started late
  absentToday: number; // working day for them, no session at all today
  offDayToday: number; // not a working day for them today
}

// ---------- PKT helpers ----------

function pktDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function pktWeekday(d: Date): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: PKT, weekday: "short" })
    .format(d)
    .toLowerCase()
    .slice(0, 3);
}

function fmtPktClock(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PKT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// Formats a bare "HH:MM:SS" (as stored on profiles.work_start_time) as a PKT
// wall-clock string, e.g. "10:00 AM" — this is the schedule the incharge/CEO
// configured for the member, not anything derived from actual sessions.
function fmtScheduledClock(workStartTime: string): string {
  const [h, m] = workStartTime.split(":").map((n) => parseInt(n, 10) || 0);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

function minutesLatePkt(startedAtIso: string, workStartTime: string): number {
  const started = new Date(startedAtIso);
  const key = pktDateKey(started);
  const [y, m, d] = key.split("-").map((n) => parseInt(n, 10));
  const [h, min, s] = workStartTime.split(":").map((n) => parseInt(n, 10) || 0);
  const scheduledUtcMs = Date.UTC(y, m - 1, d, h, min, s) - 5 * 3600_000;
  return Math.round((started.getTime() - scheduledUtcMs) / 60_000);
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function letterFor(pct: number): string {
  return pct >= 90 ? "A+" : pct >= 80 ? "A" : pct >= 70 ? "B" : "C";
}

// ---------- Loader ----------

export async function loadLiveBoard(): Promise<LiveBoard> {
  const now = new Date();
  const todayKey = pktDateKey(now);
  const since = new Date(now.getTime() - 16 * DAY_MS).toISOString();

  const [
    { data: profiles },
    { data: roleRows },
    { data: franchises },
    { data: sessions },
    gradedRows,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, full_name, franchise_id, expected_daily_hours, work_start_time, working_days",
      ),
    supabase.from("user_roles").select("user_id, role").eq("role", "member"),
    supabase.from("franchises").select("id, name"),
    supabase
      .from("study_sessions")
      .select("user_id, started_at, ended_at, active_seconds, last_heartbeat_at, status")
      .gte("started_at", since),
    fetchAllGradedRowsVisible(),
  ]);

  const memberIds = new Set((roleRows ?? []).map((r) => r.user_id));
  const members = (profiles ?? []).filter((p) => memberIds.has(p.id));
  const franchiseName = new Map((franchises ?? []).map((f) => [f.id, f.name]));
  const ids = members.map((m) => m.id);

  const completion = ids.length
    ? await fetchCompletionSummary({ userIds: ids })
    : { byUser: new Map(), courseTitles: new Map() } as Awaited<
        ReturnType<typeof fetchCompletionSummary>
      >;

  // Latest lesson touched today (proxy for "what they're working on" — the
  // work clock is global and carries no course id).
  const dayStartUtc = (() => {
    const [y, m, d] = todayKey.split("-").map((n) => parseInt(n, 10));
    return new Date(Date.UTC(y, m - 1, d) - 5 * 3600_000).toISOString();
  })();
  const { data: touchedRows } = ids.length
    ? await supabase
        .from("lesson_progress")
        .select("user_id, updated_at, lessons(title)")
        .in("user_id", ids)
        .gte("updated_at", dayStartUtc)
        .order("updated_at", { ascending: false })
    : { data: [] as any[] };
  const currentLessonByUser = new Map<string, string>();
  for (const r of (touchedRows ?? []) as any[]) {
    if (!currentLessonByUser.has(r.user_id) && r.lessons?.title) {
      currentLessonByUser.set(r.user_id, r.lessons.title);
    }
  }

  // Grade aggregates per user
  const gradeRowsByUser = new Map<string, GradedRow[]>();
  let pendingReview = 0;
  for (const g of gradedRows) {
    if (g.status === "pending") pendingReview += 1;
    const arr = gradeRowsByUser.get(g.user_id) ?? [];
    arr.push(g);
    gradeRowsByUser.set(g.user_id, arr);
  }

  // Sessions grouped per user
  const sessByUser = new Map<string, NonNullable<typeof sessions>>();
  for (const s of sessions ?? []) {
    const arr = sessByUser.get(s.user_id) ?? [];
    arr.push(s);
    sessByUser.set(s.user_id, arr);
  }

  const weekCutoff = now.getTime() - 7 * DAY_MS;

  const rows: LiveMember[] = members.map((p) => {
    const fullName = p.full_name ?? "Member";
    const workingDays: string[] = (p as any).working_days?.length
      ? (p as any).working_days
      : ["mon", "tue", "wed", "thu", "fri"];
    const expectedDailyHours = Number((p as any).expected_daily_hours ?? 8);
    const workStart = ((p as any).work_start_time as string | null) ?? "10:00:00";
    const mySessions = sessByUser.get(p.id) ?? [];

    // Today
    const todaySessions = mySessions.filter((s) => pktDateKey(new Date(s.started_at)) === todayKey);
    const hoursTodaySec = todaySessions.reduce((a, s) => a + (s.active_seconds ?? 0), 0);
    const firstToday = todaySessions.reduce<string | null>(
      (min, s) => (min === null || s.started_at < min ? s.started_at : min),
      null,
    );
    const lateMin = firstToday ? minutesLatePkt(firstToday, workStart) : 0;
    const lateInPkt = firstToday && lateMin > LATE_GRACE_MIN ? fmtPktClock(firstToday) : null;
    const actualStartPkt = firstToday ? fmtPktClock(firstToday) : null;
    const scheduledStartPkt = fmtScheduledClock(workStart);

    // Live session — actively clocked in, not paused, heartbeat still fresh.
    const openFresh = (s: (typeof mySessions)[number]) => {
      if (s.ended_at || (s as any).status === "completed") return false;
      const lh = (s as any).last_heartbeat_at ?? s.started_at;
      return Date.now() - new Date(lh).getTime() < LIVE_STALE_MS;
    };
    const live = mySessions.find((s) => openFresh(s) && (s as any).status !== "paused");
    // Paused counts separately — they clocked in today but aren't actively
    // working right now, so they must not be counted as "working now" or
    // show a ticking elapsed timer.
    const pausedSession = !live ? mySessions.find((s) => openFresh(s) && (s as any).status === "paused") : undefined;

    // Last session end (may be from a previous day — label it as such so
    // "last seen 4:05 PM" is never mistaken for something that happened
    // today when the member hasn't actually started yet).
    const lastEnd = mySessions.reduce<string | null>(
      (max, s) => (s.ended_at && (max === null || s.ended_at > max) ? s.ended_at : max),
      null,
    );
    const lastEndLabel = lastEnd
      ? pktDateKey(new Date(lastEnd)) === todayKey
        ? fmtPktClock(lastEnd)
        : `${fmtPktClock(lastEnd)}, ${new Intl.DateTimeFormat("en-US", {
            timeZone: PKT,
            month: "short",
            day: "numeric",
          }).format(new Date(lastEnd))}`
      : null;

    // Week hours vs target
    const hoursWeekSec = mySessions
      .filter((s) => new Date(s.started_at).getTime() >= weekCutoff)
      .reduce((a, s) => a + (s.active_seconds ?? 0), 0);
    const weekTargetSec = expectedDailyHours * workingDays.length * 3600;

    // Attendance over the last 14 calendar days (their working days only)
    const daysWithSession = new Set(mySessions.map((s) => pktDateKey(new Date(s.started_at))));
    let workingElapsed = 0;
    let attended = 0;
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getTime() - i * DAY_MS);
      if (!workingDays.includes(pktWeekday(d))) continue;
      workingElapsed += 1;
      if (daysWithSession.has(pktDateKey(d))) attended += 1;
    }
    const attendPct = workingElapsed > 0 ? Math.round((attended / workingElapsed) * 100) : 0;

    // Consecutive absent working days, looking back from yesterday
    let consecAbsent = 0;
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() - i * DAY_MS);
      if (!workingDays.includes(pktWeekday(d))) continue;
      if (daysWithSession.has(pktDateKey(d))) break;
      consecAbsent += 1;
    }

    const overallPct = completion.byUser.get(p.id)?.overallPct ?? 0;

    const agg = aggregateGrades(gradeRowsByUser.get(p.id) ?? []);
    const gradeAvgPct = agg.total > 0 ? agg.averagePercent : null;

    const riskReasons: string[] = [];
    if (consecAbsent >= 2) riskReasons.push(`absent ${consecAbsent} working days`);
    if (overallPct < 20) riskReasons.push("completion under 20%");
    if (hoursWeekSec === 0) riskReasons.push("0 hours this week");
    const atRisk = riskReasons.length > 0;

    const isWorkingDayToday = workingDays.includes(pktWeekday(now));
    const status: LiveStatus = live
      ? "live"
      : pausedSession
        ? "paused"
        : isWorkingDayToday
          ? "offline"
          : "off_day";

    // Elapsed time shown on the card is the server-tracked active_seconds —
    // NOT wall-clock time since clock-in. active_seconds freezes while
    // paused and only counts real tracked work, so it can never overstate
    // how long someone has actually been working (matches the same
    // server-authoritative model the clock engine itself uses).
    const liveSession = live ?? pausedSession;
    const liveActiveSec = liveSession ? (liveSession.active_seconds ?? 0) : null;

    return {
      userId: p.id,
      fullName,
      franchiseName: p.franchise_id ? franchiseName.get(p.franchise_id) ?? null : null,
      initials: initialsOf(fullName),
      overallPct,
      status,
      liveElapsedSec: liveActiveSec,
      liveStartedAtMs: liveSession ? new Date(liveSession.started_at).getTime() : null,
      currentLessonTitle: currentLessonByUser.get(p.id) ?? null,
      lateInPkt,
      lastEndPkt: lastEndLabel,
      actualStartPkt,
      scheduledStartPkt,
      atRisk,
      riskReasons,
      hoursWeekSec,
      weekTargetSec,
      attendPct,
      gradeLetter: gradeAvgPct != null ? letterFor(gradeAvgPct) : null,
      gradeAvgPct,
      hoursTodaySec,
      presentToday: todaySessions.length > 0,
    };
  });

  // Sort: at-risk first, then live, then completion desc
  rows.sort((a, b) => {
    if (a.atRisk !== b.atRisk) return a.atRisk ? -1 : 1;
    const aLive = a.status === "live" ? 1 : 0;
    const bLive = b.status === "live" ? 1 : 0;
    if (aLive !== bLive) return bLive - aLive;
    return b.overallPct - a.overallPct;
  });

  return {
    members: rows,
    presentToday: rows.filter((r) => r.presentToday).length,
    totalMembers: rows.length,
    workingNow: rows.filter((r) => r.status === "live").length,
    hoursTodaySec: rows.reduce((a, r) => a + r.hoursTodaySec, 0),
    dailyTargetSecSum: members.reduce(
      (a, p) => a + Number((p as any).expected_daily_hours ?? 8) * 3600,
      0,
    ),
    pendingReview,
    presentOnTime: rows.filter((r) => r.presentToday && !r.lateInPkt).length,
    presentLate: rows.filter((r) => r.presentToday && !!r.lateInPkt).length,
    absentToday: rows.filter((r) => !r.presentToday && r.status === "offline").length,
    offDayToday: rows.filter((r) => r.status === "off_day").length,
  };
}

// ---------- Export ----------

export function downloadLiveBoardReport(board: LiveBoard): void {
  const rows = board.members.map((m) => ({
    Member: m.fullName,
    Franchise: m.franchiseName ?? "",
    Status: m.status === "live" ? "Live" : m.status === "offline" ? "Offline" : "Off day",
    "Scheduled start": m.scheduledStartPkt,
    "Actual start today": m.actualStartPkt ?? (m.status === "off_day" ? "" : "Not started"),
    Late: m.lateInPkt ? "Yes" : "",
    "Last seen": m.lastEndPkt ?? "",
    "At risk": m.atRisk ? m.riskReasons.join("; ") : "",
    "Overall %": m.overallPct,
    "Hours this week": Math.round((m.hoursWeekSec / 3600) * 10) / 10,
    "Weekly target (h)": Math.round((m.weekTargetSec / 3600) * 10) / 10,
    "Attendance % (14d)": m.attendPct,
    "Avg grade": m.gradeLetter ?? "",
    "Avg grade %": m.gradeAvgPct ?? "",
    "Hours today": Math.round((m.hoursTodaySec / 3600) * 10) / 10,
  }));
  const summary = [
    { Metric: "Present today", Value: `${board.presentToday}/${board.totalMembers}` },
    { Metric: "Present on time", Value: board.presentOnTime },
    { Metric: "Present late", Value: board.presentLate },
    { Metric: "Absent today", Value: board.absentToday },
    { Metric: "Off day today", Value: board.offDayToday },
    { Metric: "Working now", Value: board.workingNow },
    {
      Metric: "Hours today vs target",
      Value: `${Math.round((board.hoursTodaySec / 3600) * 10) / 10}h / ${Math.round((board.dailyTargetSecSum / 3600) * 10) / 10}h`,
    },
    { Metric: "Submissions pending review", Value: board.pendingReview },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Members");
  const date = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `members-live-board-${date}.xlsx`);
}
