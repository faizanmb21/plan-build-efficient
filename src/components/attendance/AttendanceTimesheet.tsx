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
} from "lucide-react";
import {
  loadTimesheet,
  pktWeekStartKey,
  shiftWeek,
  formatWeekRange,
  formatPktClock,
  type DayCell,
  type MemberRow,
} from "@/lib/attendance-timesheet";
import { formatDuration } from "@/lib/format-duration";
import { cn } from "@/lib/utils";
import { DayDetailDialog } from "./DayDetailDialog";

interface Props {
  franchiseId: string | null;
  /** Used in the header for context, e.g. "Sargodha" or "All franchises". */
  scopeLabel: string;
}

export function AttendanceTimesheet({ franchiseId, scopeLabel }: Props) {
  const [weekStart, setWeekStart] = React.useState(() => pktWeekStartKey(new Date()));
  const [rows, setRows] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [active, setActive] = React.useState<{
    member: MemberRow;
    day: DayCell;
  } | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const data = await loadTimesheet({ franchiseId, weekStartKey: weekStart });
    setRows(data);
    setLoading(false);
  }, [franchiseId, weekStart]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [rows, search]);

  // Aggregate stats for the visible scope
  const stats = React.useMemo(() => {
    let totalActive = 0;
    let totalTarget = 0;
    let presentDays = 0;
    let lateDays = 0;
    let absentDays = 0;
    let workingDays = 0;
    for (const r of filtered) {
      totalActive += r.totalActiveSec;
      totalTarget += r.totalTargetSec;
      for (const d of r.days) {
        if (d.state === "off" || d.state === "future") continue;
        workingDays += 1;
        if (d.state === "present") presentDays += 1;
        else if (d.state === "late" || d.state === "very_late") {
          presentDays += 1;
          lateDays += 1;
        } else if (d.state === "absent") absentDays += 1;
      }
    }
    return {
      totalActive,
      totalTarget,
      attendancePct: workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0,
      lateDays,
      absentDays,
      presentDays,
      workingDays,
    };
  }, [filtered]);

  const isCurrentWeek = weekStart === pktWeekStartKey(new Date());

  return (
    <div className="space-y-4">
      {/* Filter / week bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((w) => shiftWeek(w, -1))}
          disabled={loading}
        >
          <ChevronLeft className="h-4 w-4" />
          Prev week
        </Button>
        <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-card/50 px-3 py-1.5 text-sm">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{formatWeekRange(weekStart)}</span>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => setWeekStart(pktWeekStartKey(new Date()))}
              className="ml-1 text-xs text-primary hover:underline"
            >
              This week
            </button>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((w) => shiftWeek(w, 1))}
          disabled={loading}
        >
          Next week
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search member…"
            className="h-9 w-48 pl-7"
          />
        </div>
      </div>

      {/* Aggregate stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Scope" value={scopeLabel} />
        <Stat
          label="Total active"
          value={formatDuration(stats.totalActive)}
          subtitle={
            stats.totalTarget > 0
              ? `of ${formatDuration(stats.totalTarget)} target`
              : undefined
          }
        />
        <Stat
          label="Attendance"
          value={`${stats.attendancePct}%`}
          subtitle={`${stats.presentDays}/${stats.workingDays} working days`}
          valueClass={
            stats.attendancePct >= 85
              ? "text-emerald-300"
              : stats.attendancePct >= 70
                ? "text-amber-300"
                : "text-rose-300"
          }
        />
        <Stat
          label="Late entries"
          value={`${stats.lateDays}`}
          subtitle="this week"
          valueClass={stats.lateDays > 0 ? "text-amber-300" : undefined}
        />
        <Stat
          label="Absences"
          value={`${stats.absentDays}`}
          subtitle="this week"
          valueClass={stats.absentDays > 0 ? "text-rose-300" : undefined}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading timesheet…
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
          <Table className="min-w-[920px]">
            <TableHeader>
              <TableRow className="bg-card/50">
                <TableHead className="sticky left-0 z-10 bg-card/80 backdrop-blur min-w-[160px]">
                  Member
                </TableHead>
                {filtered[0].days.map((d) => (
                  <TableHead
                    key={d.date}
                    className={cn(
                      "text-center",
                      d.dow === "Sat" || d.dow === "Sun"
                        ? "text-muted-foreground/60"
                        : "",
                    )}
                  >
                    <div>{d.dow}</div>
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {d.date.slice(8)}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right">Weekly</TableHead>
                <TableHead className="text-right">Att.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.userId} className="hover:bg-white/[0.02]">
                  <TableCell className="sticky left-0 z-10 bg-card/80 backdrop-blur font-medium">
                    <p className="truncate">{r.fullName}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Starts {formatTime(r.workStartTime)} ·{" "}
                      {r.expectedDailyHours}h/day
                    </p>
                  </TableCell>
                  {r.days.map((d) => (
                    <TableCell key={d.date} className="p-1">
                      <DayBlock
                        day={d}
                        onClick={() => setActive({ member: r, day: d })}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <p className="font-mono text-sm tabular-nums">
                      {formatDuration(r.totalActiveSec)}
                    </p>
                    {r.totalTargetSec > 0 && (
                      <p className="text-[10px] tabular-nums text-muted-foreground">
                        / {formatDuration(r.totalTargetSec)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        r.attendancePct >= 85
                          ? "text-emerald-300"
                          : r.attendancePct >= 70
                            ? "text-amber-300"
                            : "text-rose-300",
                      )}
                    >
                      {r.attendancePct}%
                    </span>
                    {r.lateCount > 0 && (
                      <p className="text-[10px] tabular-nums text-amber-300">
                        {r.lateCount} late
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Legend />

      <DayDetailDialog
        open={!!active}
        onClose={() => setActive(null)}
        memberName={active?.member.fullName ?? ""}
        memberId={active?.member.userId ?? ""}
        workStartTime={active?.member.workStartTime ?? "10:00:00"}
        day={active?.day ?? null}
      />
    </div>
  );
}

function DayBlock({ day, onClick }: { day: DayCell; onClick: () => void }) {
  const colorClass = stateBg(day.state);
  const isInteractive = day.state !== "off" && day.state !== "future";
  return (
    <button
      type="button"
      onClick={isInteractive ? onClick : undefined}
      disabled={!isInteractive}
      className={cn(
        "flex h-14 w-full flex-col items-center justify-center rounded-md border text-[11px] leading-tight transition-colors",
        colorClass,
        isInteractive && "hover:brightness-110 cursor-pointer",
        !isInteractive && "cursor-default",
      )}
      title={tooltipFor(day)}
    >
      {day.state === "off" ? (
        <span className="text-muted-foreground/60">Off</span>
      ) : day.state === "future" ? (
        <span className="text-muted-foreground/40">·</span>
      ) : day.state === "absent" ? (
        <span className="font-semibold">Absent</span>
      ) : (
        <>
          <span className="font-mono font-semibold tabular-nums">
            {formatDuration(day.activeSec)}
          </span>
          <span className="font-mono text-[10px] text-foreground/70">
            {day.firstStartIso ? formatPktClock(day.firstStartIso) : ""}
          </span>
          {day.lateMinutes > 0 && (
            <span className="font-mono text-[9px] opacity-80">
              +{day.lateMinutes}m
            </span>
          )}
          {day.live && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          )}
        </>
      )}
    </button>
  );
}

function stateBg(state: DayCell["state"]): string {
  switch (state) {
    case "present":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "late":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "very_late":
      return "border-rose-500/30 bg-rose-500/15 text-rose-100";
    case "absent":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    case "off":
      return "border-white/5 bg-white/[0.02]";
    case "future":
      return "border-white/5 bg-white/[0.01]";
  }
}

function tooltipFor(d: DayCell): string {
  if (d.state === "off") return "Off day";
  if (d.state === "future") return "Upcoming";
  if (d.state === "absent") return "Absent — no clock-in";
  const parts = [`${d.state === "present" ? "On time" : "Late"}`];
  if (d.firstStartIso) parts.push(`Started ${formatPktClock(d.firstStartIso)}`);
  if (d.lateMinutes > 0) parts.push(`${d.lateMinutes}m late`);
  if (d.activeSec) parts.push(`${formatDuration(d.activeSec)} active`);
  if (d.sessionCount > 1) parts.push(`${d.sessionCount} sessions`);
  return parts.join(" · ");
}

function formatTime(workStart: string): string {
  const [h, m] = workStart.split(":").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function Stat({
  label,
  value,
  subtitle,
  valueClass,
}: {
  label: string;
  value: string;
  subtitle?: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className={cn("mt-0.5 text-xl font-semibold tabular-nums", valueClass)}>
          {value}
        </p>
        {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <Swatch className="bg-emerald-500/30" label="Present" />
      <Swatch className="bg-amber-500/30" label="Late" />
      <Swatch className="bg-rose-500/40" label="Very late (60m+)" />
      <Swatch className="bg-rose-500/15" label="Absent" />
      <Swatch className="bg-white/10" label="Off day" />
      <span className="ml-auto">Click a day cell to see sessions, clock-in/out, idle and snapshots.</span>
    </div>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded-sm", className)} />
      {label}
    </span>
  );
}
