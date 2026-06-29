import * as React from "react";
import { GraduationCap, Clock, Calendar, CheckCircle2, Send, BookOpen } from "lucide-react";
import type { DayReportPayload } from "@/lib/day-report-types";
import { cn } from "@/lib/utils";

interface Props {
  payload: DayReportPayload;
  /** When true, force a fixed 3:4 aspect for screenshot consistency. */
  framed?: boolean;
  className?: string;
}

const STATUS_LABEL: Record<DayReportPayload["status"], string> = {
  on_track: "On track",
  slipping: "Slipping",
  at_risk: "At risk",
};

const STATUS_DOT: Record<DayReportPayload["status"], string> = {
  on_track: "bg-emerald-400",
  slipping: "bg-amber-400",
  at_risk: "bg-rose-400",
};

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function DayReportCard({ payload, framed = true, className }: Props) {
  const weekPct =
    payload.targetHoursWeek > 0
      ? Math.min(999, Math.round((payload.hoursThisWeek / payload.targetHoursWeek) * 100))
      : 0;

  const isLate = payload.lateMinutes > 0;
  const isVeryLate = payload.lateSeverity === "very_late";

  return (
    <div
      className={cn(
        "mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-card via-card to-card/90 text-card-foreground shadow-xl",
        framed && "aspect-[3/4]",
        className,
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header strip */}
        <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold leading-tight">
              {payload.fullName}
              {payload.franchiseName && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {payload.franchiseName}
                </span>
              )}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Day Report · {fmtDate(payload.reportDate)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
            <GraduationCap className="h-3.5 w-3.5" />
            <span className="text-[10px] font-semibold uppercase tracking-wider">IRM</span>
          </div>
        </header>

        {/* Time & pace */}
        <section className="space-y-2 border-b border-white/5 px-5 py-4">
          <Row
            icon={<Clock className="h-3.5 w-3.5 text-primary" />}
            label={
              <span>
                <span className="font-semibold text-foreground">
                  {fmtHours(payload.hoursToday)}
                </span>{" "}
                <span className="text-muted-foreground">today</span>
              </span>
            }
          />
          {payload.startedAtPkt && (
            <Row
              icon={
                <span
                  className={cn(
                    "inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold",
                    isVeryLate
                      ? "bg-rose-500/20 text-rose-300"
                      : isLate
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300",
                  )}
                >
                  ⏰
                </span>
              }
              label={
                <span className="text-muted-foreground">
                  Started{" "}
                  <span className="font-medium text-foreground">{payload.startedAtPkt}</span>
                  {" PKT · "}
                  {isLate ? (
                    <span
                      className={cn(
                        "font-medium",
                        isVeryLate ? "text-rose-300" : "text-amber-300",
                      )}
                    >
                      {payload.lateMinutes}m late
                    </span>
                  ) : (
                    <span className="text-emerald-300">on time</span>
                  )}{" "}
                  <span className="text-muted-foreground/70">
                    (scheduled {payload.workStartTimePkt})
                  </span>
                </span>
              }
            />
          )}
          <Row
            icon={<span className="text-[12px] leading-none">📊</span>}
            label={
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {fmtHours(payload.hoursThisWeek)}
                </span>{" "}
                / {fmtHours(payload.targetHoursWeek)} this week{" "}
                <span className="text-muted-foreground/80">({weekPct}% of target)</span>
              </span>
            }
          />
          <div className="flex items-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-0.5 text-xs font-medium">
              <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[payload.status])} />
              {STATUS_LABEL[payload.status]}
            </span>
            {isLate && (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  isVeryLate
                    ? "bg-rose-500/15 text-rose-200"
                    : "bg-amber-500/15 text-amber-200",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", isVeryLate ? "bg-rose-400" : "bg-amber-400")} />
                Late today
              </span>
            )}
          </div>
        </section>

        {/* Today's work */}
        <section className="space-y-3 border-b border-white/5 px-5 py-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              {payload.lessonsCompleted.length} lesson
              {payload.lessonsCompleted.length === 1 ? "" : "s"} completed
            </p>
            {payload.lessonsCompleted.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-5 text-xs text-muted-foreground">
                {payload.lessonsCompleted.slice(0, 6).map((l) => (
                  <li key={l.id} className="truncate">
                    • {l.title}
                  </li>
                ))}
                {payload.lessonsCompleted.length > 6 && (
                  <li className="text-muted-foreground/70">
                    + {payload.lessonsCompleted.length - 6} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-1 pl-5 text-xs text-muted-foreground/70">None today</p>
            )}
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Send className="h-3.5 w-3.5 text-primary" />
              {payload.submissions.length} submission
              {payload.submissions.length === 1 ? "" : "s"}
            </p>
            {payload.submissions.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-5 text-xs text-muted-foreground">
                {payload.submissions.slice(0, 4).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">• {s.title}</span>
                    <span className="shrink-0">{submissionBadge(s)}</span>
                  </li>
                ))}
                {payload.submissions.length > 4 && (
                  <li className="text-muted-foreground/70">
                    + {payload.submissions.length - 4} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-1 pl-5 text-xs text-muted-foreground/70">None today</p>
            )}
          </div>
        </section>

        {/* Course progress */}
        {payload.coursesWorkedOn.length > 0 && (
          <section className="space-y-3 border-b border-white/5 px-5 py-4">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              Course progress
            </p>
            <div className="space-y-2.5">
              {payload.coursesWorkedOn.slice(0, 3).map((c) => (
                <div key={c.courseId} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs font-medium text-foreground">{c.title}</p>
                    <p className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {c.completionPct}% · {c.done}/{c.total}
                    </p>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary/70"
                      style={{ width: `${Math.min(100, c.completionPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* AI summary */}
        <section className="flex-1 px-5 py-4">
          <p className="text-sm font-semibold">Today's summary</p>
          {payload.aiSummary ? (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {payload.aiSummary}
            </p>
          ) : (
            <p className="mt-1.5 text-xs italic text-muted-foreground/60">
              Summary unavailable for this report.
            </p>
          )}
        </section>

        {/* Footer */}
        <footer className="flex items-center justify-between border-t border-white/10 bg-white/[0.02] px-5 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">
          <span>IRM Academy</span>
          <span>End-of-day report</span>
        </footer>
      </div>
    </div>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0">{label}</div>
    </div>
  );
}

function fmtHours(h: number): string {
  if (h <= 0) return "0h";
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function submissionBadge(s: { status: string; grade: number | null; letterGrade: string | null }) {
  if (s.status === "pending") {
    return (
      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
        Pending QA
      </span>
    );
  }
  if (s.status === "revision") {
    return (
      <span className="rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
        Revision
      </span>
    );
  }
  if (s.letterGrade) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
        {s.letterGrade}
        {s.grade != null && ` · ${s.grade}`}
      </span>
    );
  }
  if (s.grade != null) {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-mono font-semibold text-emerald-300">
        {s.grade}
      </span>
    );
  }
  return <span className="text-[10px] text-muted-foreground/70">Approved</span>;
}
