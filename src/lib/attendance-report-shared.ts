// Pure types + math for the monthly training report. NO imports with side
// effects (no supabase) — this module is shared by the browser UI, the PDF
// renderer, and Node preview scripts.

const PKT = "Asia/Karachi";

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
  gradeAPlus: number;
  gradeA: number;
  gradeB: number;
  gradeC: number;
  days: ReportDay[];
}

// ---------- month/date display helpers ----------

export function pktMonthKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: PKT,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(d)
    .slice(0, 7);
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

/** First clock-in shown as PKT wall-clock time, e.g. "10:24 AM". */
export function formatPktClockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PKT,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

// ---------- Monthly score (hero ring) ----------

export type ScoreLetter = "A+" | "A" | "B" | "C";

export interface MonthlyScore {
  score: number; // 0-100
  letter: ScoreLetter;
}

// Weighted blend. When nothing was graded in the month, the grade weight is
// redistributed proportionally across the remaining components.
const SCORE_WEIGHTS = {
  attendance: 0.3,
  hours: 0.25,
  punctuality: 0.15,
  completion: 0.15,
  grades: 0.15,
} as const;

export function monthlyScore(r: MemberMonthReport): MonthlyScore {
  const parts: { value: number; weight: number }[] = [
    { value: r.attendancePct, weight: SCORE_WEIGHTS.attendance },
    { value: Math.min(100, r.hoursPct), weight: SCORE_WEIGHTS.hours },
    { value: r.punctualityPct, weight: SCORE_WEIGHTS.punctuality },
    { value: r.completionPct, weight: SCORE_WEIGHTS.completion },
  ];
  if (r.gradedCount > 0) {
    parts.push({ value: r.gradeAvgPct, weight: SCORE_WEIGHTS.grades });
  }
  const totalWeight = parts.reduce((a, p) => a + p.weight, 0);
  const score = Math.round(
    parts.reduce((a, p) => a + p.value * p.weight, 0) / totalWeight,
  );
  const letter: ScoreLetter = score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : "C";
  return { score, letter };
}

// ---------- Hours by calendar week (Mon–Sun) ----------

export interface WeekSlice {
  label: string; // W1, W2…
  activeSec: number;
  targetSec: number; // working (non-off, non-future) days × expected hours
}

const DOW_MON_FIRST = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function weeklyBreakdown(r: MemberMonthReport): WeekSlice[] {
  if (r.days.length === 0) return [];
  const padding = Math.max(0, DOW_MON_FIRST.indexOf(r.days[0].dow));
  const weeks: WeekSlice[] = [];
  r.days.forEach((d, i) => {
    const w = Math.floor((padding + i) / 7);
    if (!weeks[w]) weeks[w] = { label: `W${w + 1}`, activeSec: 0, targetSec: 0 };
    weeks[w].activeSec += d.activeSec;
    if (d.status !== "off" && d.status !== "future") {
      weeks[w].targetSec += r.expectedDailyHours * 3600;
    }
  });
  // Drop weeks that are entirely in the future (no elapsed working days, no hours).
  return weeks.filter((w) => w.targetSec > 0 || w.activeSec > 0);
}
