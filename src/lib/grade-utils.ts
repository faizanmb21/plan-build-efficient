// Grading helpers shared across CEO/incharge/member views.

export type LetterGrade = "A+" | "A" | "B" | "C";

export const LETTER_TO_PERCENT: Record<LetterGrade, number> = {
  "A+": 90,
  A: 85,
  B: 75,
  C: 0,
};

export interface GradedRow {
  id: string;
  user_id: string;
  lesson_id: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export interface GradeAggregate {
  total: number;          // total graded submissions (excludes pending)
  pending: number;
  aPlus: number;
  a: number;
  b: number;
  c: number;
  averagePercent: number; // 0-100, only counts graded
  passRate: number;       // 0-100, % graded that are not C
  redoRate: number;       // 0-100, % graded that are C
  lastGradedAt: string | null;
}

export function emptyAggregate(): GradeAggregate {
  return {
    total: 0,
    pending: 0,
    aPlus: 0,
    a: 0,
    b: 0,
    c: 0,
    averagePercent: 0,
    passRate: 0,
    redoRate: 0,
    lastGradedAt: null,
  };
}

export function aggregateGrades(rows: GradedRow[]): GradeAggregate {
  const agg = emptyAggregate();
  let percentSum = 0;
  let percentCount = 0;
  let lastTs = 0;

  for (const r of rows) {
    if (r.status === "pending") {
      agg.pending++;
      continue;
    }
    const letter = (r.letter_grade ?? "").trim();
    if (letter === "A+") agg.aPlus++;
    else if (letter === "A") agg.a++;
    else if (letter === "B") agg.b++;
    else if (letter === "C") agg.c++;
    else continue; // skip rows without a letter

    agg.total++;
    const pct =
      letter === "A+" ? 90 : letter === "A" ? 85 : letter === "B" ? 75 : 0;
    percentSum += pct;
    percentCount++;

    if (r.reviewed_at) {
      const t = new Date(r.reviewed_at).getTime();
      if (t > lastTs) lastTs = t;
    }
  }

  agg.averagePercent = percentCount > 0 ? Math.round(percentSum / percentCount) : 0;
  agg.passRate = agg.total > 0 ? Math.round(((agg.total - agg.c) / agg.total) * 100) : 0;
  agg.redoRate = agg.total > 0 ? Math.round((agg.c / agg.total) * 100) : 0;
  agg.lastGradedAt = lastTs > 0 ? new Date(lastTs).toISOString() : null;
  return agg;
}

export function letterToPercent(letter: string | null): number | null {
  if (!letter) return null;
  const l = letter.trim() as LetterGrade;
  return l in LETTER_TO_PERCENT ? LETTER_TO_PERCENT[l] : null;
}

export function letterColorClass(letter: string | null): string {
  switch (letter) {
    case "A+":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "A":
      return "bg-sky-500/15 text-sky-300 border-sky-500/30";
    case "B":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "C":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    default:
      return "bg-white/5 text-muted-foreground border-white/10";
  }
}

// Build a CSV string from rows of records. Quotes/escapes values.
export function toCsv<T extends Record<string, string | number | null | undefined>>(
  rows: T[],
  headers: { key: keyof T; label: string }[],
): string {
  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const head = headers.map((h) => escape(h.label)).join(",");
  const body = rows
    .map((r) => headers.map((h) => escape(r[h.key])).join(","))
    .join("\n");
  return head + "\n" + body;
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}
