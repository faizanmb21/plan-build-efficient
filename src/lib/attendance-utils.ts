// Attendance helpers: bucket study_sessions into a 14-day strip
// classified as present / late / absent / off using Pakistan time (Asia/Karachi).
// Late = first session of the day starts after 10:00 AM PKT.

export type DayState = "present" | "late" | "absent" | "off";

export interface SessionLite {
  started_at: string;
}

export interface DayCell {
  /** YYYY-MM-DD in PKT */
  date: string;
  /** weekday short in PKT */
  dow: string;
  state: DayState;
  firstStart: string | null;
}

const PKT = "Asia/Karachi";

function pktParts(d: Date): { y: string; m: string; day: string; weekday: string; hour: number; min: number } {
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
    y: parts.year, m: parts.month, day: parts.day,
    weekday: parts.weekday,
    hour: parseInt(parts.hour, 10),
    min: parseInt(parts.minute, 10),
  };
}

function pktDateKey(d: Date): string {
  const p = pktParts(d);
  return `${p.y}-${p.m}-${p.day}`;
}

function isOffDay(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

/**
 * Build a 14-day strip ending today (PKT).
 * sessions: any study sessions for the member (only started_at is read).
 */
export function buildAttendanceStrip(
  sessions: SessionLite[],
  now: Date = new Date(),
): DayCell[] {
  // Group earliest session per PKT day.
  const earliestByDay = new Map<string, Date>();
  for (const s of sessions) {
    const d = new Date(s.started_at);
    if (isNaN(d.getTime())) continue;
    const key = pktDateKey(d);
    const prev = earliestByDay.get(key);
    if (!prev || d < prev) earliestByDay.set(key, d);
  }

  const cells: DayCell[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const key = pktDateKey(d);
    const parts = pktParts(d);
    const off = isOffDay(parts.weekday);
    const first = earliestByDay.get(key) ?? null;

    let state: DayState;
    if (off) state = "off";
    else if (!first) state = "absent";
    else {
      const p = pktParts(first);
      // Late if first heartbeat strictly after 10:00 AM PKT
      state = p.hour > 10 || (p.hour === 10 && p.min > 0) ? "late" : "present";
    }

    cells.push({
      date: key,
      dow: parts.weekday,
      state,
      firstStart: first?.toISOString() ?? null,
    });
  }
  return cells;
}

/** Attendance % = present-or-late / expected (non-off) working days. */
export function attendancePercent(cells: DayCell[]): number {
  const working = cells.filter((c) => c.state !== "off");
  if (working.length === 0) return 0;
  const present = working.filter((c) => c.state === "present" || c.state === "late").length;
  return Math.round((present / working.length) * 100);
}

export function dayStateColor(state: DayState): string {
  switch (state) {
    case "present":
      return "bg-emerald-500/80";
    case "late":
      return "bg-amber-500/80";
    case "absent":
      return "bg-rose-500/60";
    case "off":
    default:
      return "bg-muted/60";
  }
}

export function dayStateLabel(state: DayState): string {
  switch (state) {
    case "present": return "Present";
    case "late": return "Late";
    case "absent": return "Absent";
    case "off": return "Off day";
  }
}
