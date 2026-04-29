// Shared progress / risk signals used across CEO, Incharge, and Member dashboards.
// Keeping this in one place ensures the "needs attention" rules don't drift
// between views.

import type { GradeAggregate, GradedRow } from "@/lib/grade-utils";

export type RiskLevel = "ok" | "watch" | "at_risk";

export interface RiskSignal {
  level: RiskLevel;
  reasons: string[];
  daysSinceActivity: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

/**
 * Risk classification for a single member.
 *
 * lastActivityAt = max(lastSubmission, lastStudySession). Pass null if unknown.
 */
export function computeMemberRisk(
  agg: GradeAggregate,
  lastActivityAt: string | null,
): RiskSignal {
  const reasons: string[] = [];
  let level: RiskLevel = "ok";

  const days = daysSince(lastActivityAt);

  // No grades yet but inactive → at_risk if very stale
  if (agg.total === 0) {
    if (days !== null && days >= 14) {
      level = "at_risk";
      reasons.push(`Inactive ${days}d, no submissions yet`);
    } else if (days !== null && days >= 7) {
      level = "watch";
      reasons.push(`Inactive ${days}d, no submissions yet`);
    }
    return { level, reasons, daysSinceActivity: days };
  }

  // Strong "at_risk" triggers
  if (agg.redoRate > 30) {
    level = "at_risk";
    reasons.push(`Redo rate ${agg.redoRate}%`);
  }
  if (agg.averagePercent > 0 && agg.averagePercent < 70) {
    level = "at_risk";
    reasons.push(`Avg ${agg.averagePercent}%`);
  }
  if (days !== null && days >= 14) {
    level = "at_risk";
    reasons.push(`Inactive ${days}d`);
  }

  if (level === "at_risk") return { level, reasons, daysSinceActivity: days };

  // Watch triggers
  if (agg.redoRate > 15) {
    level = "watch";
    reasons.push(`Redo rate ${agg.redoRate}%`);
  }
  if (agg.averagePercent > 0 && agg.averagePercent < 80) {
    level = "watch";
    reasons.push(`Avg ${agg.averagePercent}%`);
  }
  if (days !== null && days >= 7) {
    level = "watch";
    reasons.push(`Inactive ${days}d`);
  }

  return { level, reasons, daysSinceActivity: days };
}

export interface InchargeKpis {
  inchargeId: string;
  graded7d: number;
  avgTurnaroundHours: number | null; // created_at → reviewed_at
  oldestPendingDays: number | null;
  redoIssueRate: number; // % of their reviews that were redo
  totalGraded: number;
}

/**
 * Computes per-incharge grading KPIs from a flat list of submissions.
 *
 * `pendingByIncharge` is the franchise's pending count keyed by the franchise's
 * incharge user_id (since pending submissions don't have reviewed_by yet).
 */
export function computeInchargeKpis(
  inchargeId: string,
  reviewedSubs: GradedRow[],
  pendingSubs: GradedRow[],
): InchargeKpis {
  const sevenAgo = Date.now() - 7 * DAY_MS;
  let graded7d = 0;
  let turnaroundSum = 0;
  let turnaroundCount = 0;
  let redo = 0;

  for (const s of reviewedSubs) {
    if (!s.reviewed_at) continue;
    const reviewedTs = new Date(s.reviewed_at).getTime();
    if (reviewedTs >= sevenAgo) graded7d++;
    const created = new Date(s.created_at).getTime();
    if (Number.isFinite(created) && reviewedTs > created) {
      turnaroundSum += (reviewedTs - created) / (1000 * 60 * 60);
      turnaroundCount++;
    }
    if ((s.letter_grade ?? "").trim() === "C") redo++;
  }

  let oldestPendingDays: number | null = null;
  for (const p of pendingSubs) {
    const d = Math.floor((Date.now() - new Date(p.created_at).getTime()) / DAY_MS);
    if (oldestPendingDays === null || d > oldestPendingDays) oldestPendingDays = d;
  }

  return {
    inchargeId,
    graded7d,
    avgTurnaroundHours:
      turnaroundCount > 0 ? Math.round((turnaroundSum / turnaroundCount) * 10) / 10 : null,
    oldestPendingDays,
    redoIssueRate:
      reviewedSubs.length > 0 ? Math.round((redo / reviewedSubs.length) * 100) : 0,
    totalGraded: reviewedSubs.length,
  };
}

export function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

export function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case "at_risk":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
    case "watch":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    default:
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
  }
}

export function riskLabel(level: RiskLevel): string {
  return level === "at_risk" ? "At risk" : level === "watch" ? "Watch" : "On track";
}
