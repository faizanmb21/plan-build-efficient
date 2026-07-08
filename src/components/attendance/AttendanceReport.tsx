import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CalendarDays,
  Search,
  Download,
  X as XIcon,
  GraduationCap,
} from "lucide-react";
import {
  loadMonthlyReport,
  pktMonthKey,
  shiftMonth,
  monthLabel,
  monthlyScore,
  weeklyBreakdown,
  type MemberMonthReport,
  type ReportDay,
} from "@/lib/attendance-report";
import { formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  franchiseId: string | null;
  scopeLabel: string;
}

export function AttendanceReport({ franchiseId, scopeLabel }: Props) {
  const [monthKey, setMonthKey] = React.useState(() => pktMonthKey());
  const [rows, setRows] = React.useState<MemberMonthReport[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<MemberMonthReport | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    const data = await loadMonthlyReport({ franchiseId, monthKey });
    setRows(data);
    setSelected(null);
    setLoading(false);
  }, [franchiseId, monthKey]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [rows, search]);

  const stats = React.useMemo(() => {
    const n = filtered.length;
    if (n === 0)
      return { avgAttendance: 0, avgPunctuality: 0, avgCompletion: 0, totalHours: 0, lateTotal: 0 };
    return {
      avgAttendance: Math.round(filtered.reduce((a, r) => a + r.attendancePct, 0) / n),
      avgPunctuality: Math.round(filtered.reduce((a, r) => a + r.punctualityPct, 0) / n),
      avgCompletion: Math.round(filtered.reduce((a, r) => a + r.completionPct, 0) / n),
      totalHours: filtered.reduce((a, r) => a + r.activeSec, 0),
      lateTotal: filtered.reduce((a, r) => a + r.lateDays, 0),
    };
  }, [filtered]);

  const isCurrentMonth = monthKey >= pktMonthKey();

  const exportRosterPdf = async () => {
    setExporting(true);
    try {
      const mod = await import("./report-pdf");
      await mod.downloadRosterPdf(filtered, monthKey, scopeLabel);
    } catch (e) {
      console.error(e);
      toast.error("Could not build the PDF — try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonthKey((m) => shiftMonth(m, -1))}
          disabled={loading}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev month
        </Button>
        <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-card/50 px-3 py-1.5 text-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{monthLabel(monthKey)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setMonthKey((m) => shiftMonth(m, 1))}
          disabled={loading || isCurrentMonth}
        >
          Next month
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="secondary"
          size="sm"
          className="ml-auto gap-1.5"
          disabled={loading || exporting || filtered.length === 0}
          onClick={exportRosterPdf}
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          Download PDF
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member…"
            className="h-9 w-44 pl-7"
          />
        </div>
      </div>

      {/* Scope stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat
          label="Avg attendance"
          value={`${stats.avgAttendance}%`}
          valueClass={pctClass(stats.avgAttendance)}
        />
        <Stat
          label="Avg punctuality"
          value={`${stats.avgPunctuality}%`}
          valueClass={pctClass(stats.avgPunctuality)}
        />
        <Stat
          label="Avg completion"
          value={`${stats.avgCompletion}%`}
          valueClass={pctClass(stats.avgCompletion)}
        />
        <Stat label="Total hours" value={formatDuration(stats.totalHours)} />
        <Stat
          label="Late arrivals"
          value={`${stats.lateTotal}`}
          valueClass={stats.lateTotal > 0 ? "text-amber-300" : undefined}
        />
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Building report…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No members in this scope.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-md border border-white/10">
          <Table className="min-w-[1000px]">
            <TableHeader>
              <TableRow className="bg-card/50">
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Present</TableHead>
                <TableHead className="text-right">Late</TableHead>
                <TableHead className="text-right">Absent</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">Punctuality</TableHead>
                <TableHead className="text-right">Hours</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Avg grade</TableHead>
                <TableHead className="text-right">Lessons</TableHead>
                <TableHead className="text-right">Subs</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.userId} className="hover:bg-white/[0.02]">
                  <TableCell className="font-medium">{r.fullName}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.presentDays}/{r.workingDayCount}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      r.lateDays > 0 && "text-amber-300",
                    )}
                  >
                    {r.lateDays}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      r.absentDays > 0 && "text-rose-300",
                    )}
                  >
                    {r.absentDays}
                  </TableCell>
                  <TableCell className="text-right">
                    <PctChip pct={r.attendancePct} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PctChip pct={r.punctualityPct} />
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-mono text-sm tabular-nums">
                      {formatDuration(r.activeSec)}
                    </span>
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {r.hoursPct}% of target
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    <PctChip pct={r.completionPct} />
                  </TableCell>
                  <TableCell className="text-right">
                    {r.gradedCount > 0 ? (
                      <PctChip pct={r.gradeAvgPct} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.lessonsCompleted}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.submissionsCount}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelected(r)}>
                      Report card
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && (
        <ReportCard
          member={selected}
          monthKey={monthKey}
          scopeLabel={scopeLabel}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Printable per-member report card (ClassDojo-style, training edition)
// ---------------------------------------------------------------------------

function ReportCard({
  member,
  monthKey,
  scopeLabel,
  onClose,
}: {
  member: MemberMonthReport;
  monthKey: string;
  scopeLabel: string;
  onClose: () => void;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = React.useState(false);
  React.useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [member.userId]);

  const exportMemberPdf = async () => {
    setExporting(true);
    try {
      const mod = await import("./report-pdf");
      await mod.downloadMemberPdf(member, monthKey, scopeLabel);
    } catch (e) {
      console.error(e);
      toast.error("Could not build the PDF — try again.");
    } finally {
      setExporting(false);
    }
  };

  // Calendar layout: pad to the weekday of the 1st (Mon-first grid)
  const firstDow = member.days[0]
    ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(member.days[0].dow)
    : 0;
  const padding = firstDow < 0 ? 0 : firstDow;

  return (
    <div ref={cardRef} className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Report card
        </h3>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5" onClick={exportMemberPdf} disabled={exporting}>
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Download PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-card text-card-foreground shadow-xl">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-6 py-4 print:border-black/10">
          <div>
            <p className="text-lg font-semibold leading-tight">{member.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {scopeLabel} · Training report · {monthLabel(monthKey)}
            </p>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
            <GraduationCap className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              IRM Academy
            </span>
          </div>
        </header>

        {/* Hero — monthly score ring + metric bars */}
        <section className="flex flex-col items-center gap-5 border-b border-white/10 px-6 py-5 sm:flex-row">
          <ScoreRingSvg member={member} />
          <div className="w-full flex-1 space-y-2.5">
            <MetricRow label="Attendance" detail={`${member.presentDays}/${member.workingDayCount} days`} pct={member.attendancePct} />
            <MetricRow label="Punctuality" detail={`${member.lateDays} late day${member.lateDays === 1 ? "" : "s"}`} pct={member.punctualityPct} />
            <MetricRow label="Hours" detail={`${formatDuration(member.activeSec)} of ${formatDuration(member.targetSec)}`} pct={member.hoursPct} />
            <MetricRow label="Course completion" detail={`${member.courses.length} course${member.courses.length === 1 ? "" : "s"}`} pct={member.completionPct} />
            <MetricRow label="Avg grade" detail={member.gradedCount > 0 ? `${member.gradedCount} graded` : "nothing graded"} pct={member.gradedCount > 0 ? member.gradeAvgPct : null} />
          </div>
        </section>

        {/* Per-course standing */}
        {member.courses.length > 0 && (
          <section className="border-b border-white/10 px-6 py-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Course completion (current standing)
            </p>
            <div className="space-y-2.5">
              {member.courses.slice(0, 6).map((c) => (
                <div key={c.courseId} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs font-medium">{c.title}</p>
                    <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {c.done}/{c.total} · {c.pct}%
                    </p>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        c.pct >= 90
                          ? "bg-emerald-500/80"
                          : c.pct >= 75
                            ? "bg-amber-500/80"
                            : "bg-rose-500/70",
                      )}
                      style={{ width: `${Math.min(100, c.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {member.lessonsCompleted} lesson{member.lessonsCompleted === 1 ? "" : "s"} completed this
              month · {member.submissionsCount} submission{member.submissionsCount === 1 ? "" : "s"} ·{" "}
              {member.gradePending} pending QA
            </p>
          </section>
        )}

        {/* Hours by week + grade mix */}
        <section className="grid gap-5 border-b border-white/10 px-6 py-4 sm:grid-cols-2">
          <WeeklyBars member={member} />
          <GradeMixBar member={member} />
        </section>

        {/* Day calendar */}
        <section className="px-6 py-4">
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: padding }).map((_, i) => (
              <span key={`pad-${i}`} />
            ))}
            {member.days.map((d) => (
              <DayCell key={d.date} day={d} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <LegendDot className="bg-emerald-500/70" label="On time" />
            <LegendDot className="bg-amber-500/70" label="Late" />
            <LegendDot className="bg-rose-500/80" label="Very late" />
            <LegendDot className="bg-rose-500/30" label="Absent" />
            <LegendDot className="bg-white/10" label="Off / upcoming" />
          </div>
        </section>

        <footer className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-6 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 print:border-black/10">
          <span>IRM Academy</span>
          <span>Generated {new Date().toLocaleDateString()}</span>
        </footer>
      </div>
    </div>
  );
}

function DayCell({ day }: { day: ReportDay }) {
  const cls =
    day.status === "present"
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/30"
      : day.status === "late"
        ? "bg-amber-500/20 text-amber-200 border-amber-500/30"
        : day.status === "very_late"
          ? "bg-rose-500/25 text-rose-200 border-rose-500/40"
          : day.status === "absent"
            ? "bg-rose-500/10 text-rose-300/80 border-rose-500/20"
            : "bg-white/[0.03] text-muted-foreground/50 border-white/5";
  const title =
    day.status === "off"
      ? "Off day"
      : day.status === "future"
        ? "Upcoming"
        : day.status === "absent"
          ? "Absent"
          : `${day.status === "present" ? "On time" : `Late ${day.lateMinutes}m`}${
              day.activeSec ? ` · ${formatDuration(day.activeSec)}` : ""
            }`;
  return (
    <div
      title={`${day.date} — ${title}`}
      className={cn(
        "flex h-9 flex-col items-center justify-center rounded border text-[10px] leading-none",
        cls,
      )}
    >
      <span className="font-semibold">{parseInt(day.date.slice(8), 10)}</span>
      {day.activeSec > 0 && day.status !== "off" && (
        <span className="mt-0.5 font-mono text-[8px] opacity-80">
          {Math.round(day.activeSec / 360) / 10}h
        </span>
      )}
    </div>
  );
}

function pctHex(pct: number): string {
  return pct >= 90 ? "#34d399" : pct >= 75 ? "#fbbf24" : "#fb7185";
}

function ScoreRingSvg({ member }: { member: MemberMonthReport }) {
  const { score, letter } = monthlyScore(member);
  const R = 50;
  const C = 2 * Math.PI * R;
  const dash = (Math.min(100, score) / 100) * C;
  const color = pctHex(score);
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 120 120" className="h-28 w-28 -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="11" />
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums leading-none">{score}</span>
        <span className="mt-1 text-[8px] uppercase tracking-wider text-muted-foreground">
          Monthly score
        </span>
        <span
          className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ color, backgroundColor: `${color}22` }}
        >
          Grade {letter}
        </span>
      </div>
    </div>
  );
}

function MetricRow({
  label,
  detail,
  pct,
}: {
  label: string;
  detail: string;
  pct: number | null;
}) {
  const v = pct ?? 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span>
          {label} <span className="text-[10px] text-muted-foreground">· {detail}</span>
        </span>
        <span className={cn("font-semibold tabular-nums", pct != null ? pctClass(v) : "text-muted-foreground")}>
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
        {pct != null && (
          <div
            className={cn(
              "h-full rounded-full",
              v >= 90 ? "bg-emerald-500/80" : v >= 75 ? "bg-amber-500/80" : "bg-rose-500/70",
            )}
            style={{ width: `${Math.min(100, v)}%` }}
          />
        )}
      </div>
    </div>
  );
}

function WeeklyBars({ member }: { member: MemberMonthReport }) {
  const weeks = weeklyBreakdown(member);
  const weeklyTargetSec = 5 * member.expectedDailyHours * 3600;
  const maxActive = Math.max(...weeks.map((w) => w.activeSec), 0);
  const maxSec = Math.max(maxActive, weeklyTargetSec) * 1.18 || 1;
  const targetPct = (weeklyTargetSec / maxSec) * 100;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Hours by week
        </p>
        <p className="text-[10px] text-muted-foreground">
          Target {Math.round(weeklyTargetSec / 3600)}h/wk
        </p>
      </div>
      {weeks.length === 0 ? (
        <p className="text-xs text-muted-foreground/70">No hours yet.</p>
      ) : (
        <>
          <div className="relative flex h-20 items-end gap-3">
            <div
              className="absolute inset-x-0 border-t border-dashed border-white/25"
              style={{ bottom: `${targetPct}%` }}
            />
            {weeks.map((w) => {
              const h = Math.max(3, (w.activeSec / maxSec) * 100);
              const hit = w.targetSec === 0 || w.activeSec >= w.targetSec;
              return (
                <div key={w.label} className="flex flex-1 flex-col items-center justify-end">
                  <span className="mb-1 text-[9px] text-muted-foreground">
                    {(w.activeSec / 3600).toFixed(1)}h
                  </span>
                  <div
                    className={cn("w-6 rounded-t", hit ? "bg-primary" : "bg-primary/40")}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1 flex border-t border-white/5 pt-1">
            {weeks.map((w) => (
              <span key={w.label} className="flex-1 text-center text-[10px] text-muted-foreground">
                {w.label}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GradeMixBar({ member }: { member: MemberMonthReport }) {
  const total = member.gradedCount;
  const segs = [
    { label: "A+", n: member.gradeAPlus, cls: "bg-emerald-500" },
    { label: "A", n: member.gradeA, cls: "bg-emerald-400" },
    { label: "B", n: member.gradeB, cls: "bg-amber-500" },
    { label: "C", n: member.gradeC, cls: "bg-rose-500" },
  ];
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Grade mix {total > 0 ? `(${total} graded)` : ""}
      </p>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground/70">
          No graded work this month.
          {member.gradePending > 0 ? ` ${member.gradePending} pending QA.` : ""}
        </p>
      ) : (
        <>
          <div className="flex h-4 overflow-hidden rounded">
            {segs
              .filter((x) => x.n > 0)
              .map((x) => (
                <div key={x.label} className={x.cls} style={{ width: `${(x.n / total) * 100}%` }} />
              ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-muted-foreground">
            {segs.map((x) => (
              <span key={x.label} className="inline-flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-sm", x.cls)} />
                {x.label} · {x.n}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            {member.gradePending} pending QA · {member.gradePassRate}% pass rate
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", valueClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function PctChip({ pct }: { pct: number }) {
  return (
    <span
      className={cn(
        "inline-block min-w-[3.5rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular-nums",
        pct >= 90
          ? "bg-emerald-500/15 text-emerald-300"
          : pct >= 75
            ? "bg-amber-500/15 text-amber-300"
            : "bg-rose-500/15 text-rose-300",
      )}
    >
      {pct}%
    </span>
  );
}

function pctClass(pct: number): string {
  return pct >= 90 ? "text-emerald-300" : pct >= 75 ? "text-amber-300" : "text-rose-300";
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
