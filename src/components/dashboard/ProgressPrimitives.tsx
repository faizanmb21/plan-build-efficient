import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ArrowRight, Building2, Clock, Sparkles } from "lucide-react";
import type { GradeAggregate } from "@/lib/grade-utils";
import { formatRelative } from "@/lib/grade-utils";
import {
  riskBadgeClass,
  riskLabel,
  type InchargeKpis,
  type RiskSignal,
} from "@/lib/progress-signals";
import { formatHours } from "@/lib/progress-signals";

/* ------------------------------------------------------------------ */
/* Distribution bar — small horizontal A+/A/B/C strip used in tables  */
/* ------------------------------------------------------------------ */
export function GradeDistributionBar({
  agg,
  width = 100,
}: {
  agg: GradeAggregate;
  width?: number;
}) {
  const total = agg.aPlus + agg.a + agg.b + agg.c;
  if (total === 0) {
    return (
      <div
        className="inline-block h-1.5 rounded-full bg-white/5"
        style={{ width }}
        aria-label="No graded submissions"
      />
    );
  }
  const seg = (count: number, color: string) =>
    count > 0 ? (
      <div className={color} style={{ width: `${(count / total) * 100}%` }} title={`${count}`} />
    ) : null;
  return (
    <div
      className="inline-flex h-1.5 overflow-hidden rounded-full bg-white/5"
      style={{ width }}
    >
      {seg(agg.aPlus, "bg-emerald-500")}
      {seg(agg.a, "bg-sky-500")}
      {seg(agg.b, "bg-amber-500")}
      {seg(agg.c, "bg-rose-500")}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Attention list — members who need follow-up, sorted by severity    */
/* ------------------------------------------------------------------ */
export interface AttentionItem {
  userId: string;
  fullName: string | null;
  franchiseName?: string | null;
  signal: RiskSignal;
  agg: GradeAggregate;
  onView?: () => void;
}

export function AttentionList({
  items,
  emptyHint = "Everyone's on track. 🎉",
  showFranchise = false,
  limit = 10,
}: {
  items: AttentionItem[];
  emptyHint?: string;
  showFranchise?: boolean;
  limit?: number;
}) {
  const order = { at_risk: 0, watch: 1, ok: 2 } as const;
  const ranked = [...items]
    .filter((i) => i.signal.level !== "ok")
    .sort((a, b) => {
      const dl = order[a.signal.level] - order[b.signal.level];
      if (dl !== 0) return dl;
      return a.agg.averagePercent - b.agg.averagePercent;
    })
    .slice(0, limit);

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-rose-500/[0.04]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Needs attention
        </CardTitle>
        <CardDescription>
          Members with low scores, high redo rate, or no recent activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {ranked.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {ranked.map((it) => (
              <li
                key={it.userId}
                className="flex items-center gap-3 py-2.5"
              >
                <Badge
                  variant="outline"
                  className={`shrink-0 ${riskBadgeClass(it.signal.level)}`}
                >
                  {riskLabel(it.signal.level)}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {it.fullName ?? "Unnamed"}
                    {showFranchise && it.franchiseName && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        · {it.franchiseName}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {it.signal.reasons.join(" · ") || "—"}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                  {it.agg.total > 0 ? `${it.agg.averagePercent}% avg` : "no grades"}
                </div>
                {it.onView && (
                  <Button size="sm" variant="ghost" onClick={it.onView}>
                    View
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Member leaderboard — ranked table                                   */
/* ------------------------------------------------------------------ */
export interface MemberRow {
  userId: string;
  fullName: string | null;
  agg: GradeAggregate;
  lastActivityAt: string | null;
  signal: RiskSignal;
}

export function MemberLeaderboard({
  rows,
  onView,
  emptyHint = "No members yet.",
}: {
  rows: MemberRow[];
  onView?: (userId: string) => void;
  emptyHint?: string;
}) {
  const sorted = [...rows].sort((a, b) => {
    if (b.agg.total === 0 && a.agg.total > 0) return -1;
    if (a.agg.total === 0 && b.agg.total > 0) return 1;
    return b.agg.averagePercent - a.agg.averagePercent;
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Member leaderboard</CardTitle>
        <CardDescription>
          Ranked by average grade. Click a row to open the full report.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Graded</TableHead>
                <TableHead>Mix</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Pass</TableHead>
                <TableHead className="text-right">Last activity</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow key={r.userId} className="hover:bg-white/[0.02]">
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    {r.fullName ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${riskBadgeClass(r.signal.level)}`}>
                      {riskLabel(r.signal.level)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {r.agg.total}
                  </TableCell>
                  <TableCell>
                    <GradeDistributionBar agg={r.agg} />
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {r.agg.total > 0 ? `${r.agg.averagePercent}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {r.agg.total > 0 ? `${r.agg.passRate}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatRelative(r.lastActivityAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    {onView && (
                      <Button size="sm" variant="ghost" onClick={() => onView(r.userId)}>
                        View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    {emptyHint}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Franchise leaderboard — for the CEO                                 */
/* ------------------------------------------------------------------ */
export interface FranchiseRow {
  id: string;
  name: string;
  inchargeName: string | null;
  memberCount: number;
  agg: GradeAggregate;
  pendingCount: number;
  lastGradedAt: string | null;
}

export function FranchiseLeaderboard({ rows }: { rows: FranchiseRow[] }) {
  const sorted = [...rows].sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Franchise leaderboard</CardTitle>
        <CardDescription>
          Compare every franchise side-by-side. Click to drill in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">#</TableHead>
                <TableHead>Franchise</TableHead>
                <TableHead>Incharge</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Graded</TableHead>
                <TableHead>Mix</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Last graded</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r, i) => (
                <TableRow key={r.id} className="hover:bg-white/[0.02]">
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-accent" />
                      {r.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.inchargeName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.memberCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.agg.total}</TableCell>
                  <TableCell>
                    <GradeDistributionBar agg={r.agg} width={120} />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.agg.total > 0 ? `${r.agg.averagePercent}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.pendingCount > 0 ? (
                      <span className="text-amber-400">{r.pendingCount}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatRelative(r.lastGradedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      to="/ceo/franchises/$id"
                      params={{ id: r.id }}
                      className="inline-flex items-center text-xs text-accent hover:underline"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    No franchises yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Incharge scorecard — measures the grader, CEO-only                 */
/* ------------------------------------------------------------------ */
export interface InchargeRow {
  inchargeId: string;
  inchargeName: string | null;
  franchiseName: string | null;
  kpis: InchargeKpis;
  pendingInFranchise: number;
}

export function InchargeScorecard({ rows }: { rows: InchargeRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Incharge scorecard</CardTitle>
        <CardDescription>
          How fast are graders reviewing, and how strict / lenient are they?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Incharge</TableHead>
                <TableHead>Franchise</TableHead>
                <TableHead className="text-right">Graded · 7d</TableHead>
                <TableHead className="text-right">Avg turnaround</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Oldest pending</TableHead>
                <TableHead className="text-right">Redo rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const stale = (r.kpis.oldestPendingDays ?? 0) >= 3;
                return (
                  <TableRow key={r.inchargeId} className="hover:bg-white/[0.02]">
                    <TableCell className="font-medium">{r.inchargeName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.franchiseName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.kpis.graded7d}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {formatHours(r.kpis.avgTurnaroundHours)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pendingInFranchise > 0 ? (
                        <span className="text-amber-400">{r.pendingInFranchise}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.kpis.oldestPendingDays === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={stale ? "text-rose-400" : "text-muted-foreground"}>
                          {r.kpis.oldestPendingDays}d
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.kpis.redoIssueRate}%
                    </TableCell>
                  </TableRow>
                );
              })}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No incharges yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Pillar coverage bars — avg% per course                              */
/* ------------------------------------------------------------------ */
export interface PillarRow {
  courseId: string;
  title: string;
  agg: GradeAggregate;
}

export function PillarCoverageBars({
  rows,
  title = "Pillar performance",
  description = "Average grade per pillar across these members.",
}: {
  rows: PillarRow[];
  title?: string;
  description?: string;
}) {
  const sorted = [...rows].sort((a, b) => b.agg.averagePercent - a.agg.averagePercent);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-accent" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No graded submissions yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((r) => {
              const pct = r.agg.averagePercent;
              const tone =
                pct >= 85 ? "bg-emerald-500"
                : pct >= 75 ? "bg-sky-500"
                : pct >= 60 ? "bg-amber-500"
                : "bg-rose-500";
              return (
                <li key={r.courseId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="truncate font-medium">{r.title}</span>
                    <span className="ml-2 shrink-0 tabular-nums text-muted-foreground">
                      {r.agg.total} · <span className="text-foreground">{pct}%</span>
                      {r.agg.c > 0 && (
                        <span className="ml-1.5 text-rose-400">{r.agg.c} redo</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={`${tone} h-full rounded-full transition-all`}
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/* === MOCKUP-MATCHED PRIMITIVES (KpiTile / CompletionBar / pills) === */
/* ================================================================== */

export type KpiTone = "indigo" | "emerald" | "sky" | "amber" | "rose" | "neutral";

export function KpiTile({
  label,
  value,
  subtitle,
  tone = "indigo",
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  tone?: KpiTone;
}) {
  const valueCls =
    tone === "emerald"
      ? "text-emerald-400"
      : tone === "sky"
        ? "text-sky-400"
        : tone === "amber"
          ? "text-amber-400"
          : tone === "rose"
            ? "text-rose-400"
            : tone === "neutral"
              ? "text-foreground"
              : "text-indigo-400";
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 font-display text-4xl font-bold tabular-nums leading-none ${valueCls}`}>
        {value}
      </p>
      {subtitle && (
        <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}

/** Color-tiered horizontal completion bar with a right-aligned percentage. */
export function CompletionBar({
  pct,
  width = 120,
  showLabel = true,
  muted = false,
}: {
  pct: number;
  width?: number;
  showLabel?: boolean;
  muted?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, Math.round(pct)));
  const tone =
    muted
      ? "bg-white/15"
      : safe >= 80
        ? "bg-emerald-500"
        : safe >= 65
          ? "bg-sky-500"
          : safe >= 45
            ? "bg-amber-500"
            : safe > 0
              ? "bg-rose-500"
              : "bg-white/10";
  const labelCls =
    muted
      ? "text-muted-foreground"
      : safe >= 80
        ? "text-emerald-400"
        : safe >= 65
          ? "text-sky-400"
          : safe >= 45
            ? "text-amber-400"
            : safe > 0
              ? "text-rose-400"
              : "text-muted-foreground";
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"
        style={{ width }}
      >
        <div
          className={`${tone} h-full rounded-full transition-all`}
          style={{ width: `${Math.max(safe === 0 ? 0 : 4, safe)}%` }}
        />
      </div>
      {showLabel && (
        <span className={`tabular-nums text-xs font-medium ${labelCls}`}>
          {safe}%
        </span>
      )}
    </div>
  );
}

export type StatusTone =
  | "strong"
  | "good"
  | "watch"
  | "at_risk"
  | "on_track"
  | "active"
  | "slow"
  | "completed"
  | "in_progress"
  | "due_soon"
  | "overdue"
  | "not_started"
  | "pending"
  | "new"
  | "urgent"
  | "review";

const STATUS_CLASSES: Record<StatusTone, string> = {
  strong: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  good: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  watch: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  at_risk: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  on_track: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  active: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  slow: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  in_progress: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  due_soon: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  overdue: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  not_started: "bg-white/8 text-muted-foreground border-white/10",
  pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  new: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  urgent: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  review: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const STATUS_LABELS: Record<StatusTone, string> = {
  strong: "Strong",
  good: "Good",
  watch: "Watch",
  at_risk: "At risk",
  on_track: "On track",
  active: "Active",
  slow: "Slow",
  completed: "Completed",
  in_progress: "In progress",
  due_soon: "Due soon",
  overdue: "Overdue",
  not_started: "Not started",
  pending: "Pending",
  new: "New",
  urgent: "Urgent",
  review: "Review",
};

export function StatusPill({
  tone,
  label,
  className = "",
}: {
  tone: StatusTone;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[tone]} ${className}`}
    >
      {label ?? STATUS_LABELS[tone]}
    </span>
  );
}

/** Letter grade + percent inline (e.g. "A+ · 91%") */
export function LetterGradeCell({
  letter,
  percent,
}: {
  letter: string | null;
  percent: number;
}) {
  if (!letter || percent <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const tone =
    letter === "A+"
      ? "text-emerald-400"
      : letter === "A"
        ? "text-sky-400"
        : letter === "B"
          ? "text-amber-400"
          : "text-rose-400";
  return (
    <span className={`font-medium tabular-nums ${tone}`}>
      {letter} · {percent}%
    </span>
  );
}

/** Small text-only colored issue badge (e.g. "3 overdue", "No login 7d"). */
export function IssueBadge({
  label,
  tone = "rose",
}: {
  label: string;
  tone?: "rose" | "amber" | "sky";
}) {
  const cls =
    tone === "amber"
      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
      : tone === "sky"
        ? "bg-sky-500/15 text-sky-300 border-sky-500/30"
        : "bg-rose-500/15 text-rose-300 border-rose-500/30";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

/** Compact circular avatar with initials. */
export function MiniAvatar({
  name,
  tone = "indigo",
}: {
  name: string | null;
  tone?: "indigo" | "emerald" | "sky" | "amber" | "rose";
}) {
  const initials =
    (name ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]!.toUpperCase())
      .join("") || "?";
  const cls =
    tone === "emerald"
      ? "bg-emerald-500/20 text-emerald-300"
      : tone === "sky"
        ? "bg-sky-500/20 text-sky-300"
        : tone === "amber"
          ? "bg-amber-500/20 text-amber-300"
          : tone === "rose"
            ? "bg-rose-500/20 text-rose-300"
            : "bg-indigo-500/20 text-indigo-300";
  return (
    <span
      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${cls}`}
    >
      {initials}
    </span>
  );
}

/** Risk level → status tone helper for franchise-level rollups */
export function franchiseStatusTone(avgPct: number): StatusTone {
  if (avgPct >= 85) return "strong";
  if (avgPct >= 75) return "good";
  if (avgPct >= 60) return "watch";
  return "at_risk";
}

/** Pill for grade-distribution legend. */
export function GradeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-emerald-500" /> A+ 90%+
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-sky-500" /> A 85%+
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-amber-500" /> B 75%+
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-sm bg-rose-500" /> C redo
      </span>
    </div>
  );
}

/** Grade-summary horizontal bars (A+/A/B/C) — used in incharge & member cards. */
export function GradeSummaryBars({ agg }: { agg: GradeAggregate }) {
  const total = agg.aPlus + agg.a + agg.b + agg.c;
  const rows = [
    { label: "A+ grades (90%+)", count: agg.aPlus, tone: "bg-emerald-500", text: "text-emerald-400" },
    { label: "A grades (85%+)", count: agg.a, tone: "bg-sky-500", text: "text-sky-400" },
    { label: "B grades (75%+)", count: agg.b, tone: "bg-amber-500", text: "text-amber-400" },
    { label: "C grades (redo)", count: agg.c, tone: "bg-rose-500", text: "text-rose-400" },
  ];
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
        return (
          <li key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`font-medium tabular-nums ${r.text}`}>
                {total > 0 ? `${pct}%` : `${r.count}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`${r.tone} h-full rounded-full`}
                style={{ width: `${total > 0 ? Math.max(pct === 0 ? 0 : 4, pct) : 0}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

