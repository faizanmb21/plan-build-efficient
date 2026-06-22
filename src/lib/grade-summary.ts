// Shared grade aggregation helpers.
// Pulls submissions (both lesson and project) for a set of users and rolls
// them into per-user or aggregate GradeAggregates for use across all
// dashboards.

import {
  aggregateGrades,
  emptyAggregate,
  type GradeAggregate,
  type GradedRow,
} from "@/lib/grade-utils";
import { fetchAllGradedRows } from "@/lib/all-grades";

/**
 * Fetches all submissions for the given users and returns a Map keyed by user_id.
 * Users with no submissions get an empty aggregate.
 */
export async function fetchGradeSummaries(
  userIds: string[],
): Promise<Map<string, GradeAggregate>> {
  const out = new Map<string, GradeAggregate>();
  for (const id of userIds) out.set(id, emptyAggregate());
  if (userIds.length === 0) return out;

  const rows = await fetchAllGradedRows(userIds);
  const byUser = new Map<string, GradedRow[]>();
  for (const row of rows) {
    const arr = byUser.get(row.user_id) ?? [];
    arr.push(row);
    byUser.set(row.user_id, arr);
  }
  for (const [uid, list] of byUser) {
    out.set(uid, aggregateGrades(list));
  }
  return out;
}

/**
 * Fetches an aggregate across many users at once (single roll-up).
 */
export async function fetchAggregateForUsers(
  userIds: string[],
): Promise<GradeAggregate> {
  if (userIds.length === 0) return emptyAggregate();
  const rows = await fetchAllGradedRows(userIds);
  return aggregateGrades(rows);
}

/**
 * Fetches an aggregate for a single user.
 */
export async function fetchAggregateForUser(
  userId: string,
): Promise<GradeAggregate> {
  return fetchAggregateForUsers([userId]);
}

/**
 * Combine many per-user aggregates into one (used when we already have the
 * per-user map and want a roll-up without another query).
 */
export function combineAggregates(
  aggs: Iterable<GradeAggregate>,
): GradeAggregate {
  const out = emptyAggregate();
  let percentSum = 0;
  let percentCount = 0;
  let lastTs = 0;
  for (const a of aggs) {
    out.aPlus += a.aPlus;
    out.a += a.a;
    out.b += a.b;
    out.c += a.c;
    out.total += a.total;
    out.pending += a.pending;
    if (a.total > 0) {
      percentSum += a.averagePercent * a.total;
      percentCount += a.total;
    }
    if (a.lastGradedAt) {
      const t = new Date(a.lastGradedAt).getTime();
      if (t > lastTs) lastTs = t;
    }
  }
  out.averagePercent = percentCount > 0 ? Math.round(percentSum / percentCount) : 0;
  out.passRate = out.total > 0 ? Math.round(((out.total - out.c) / out.total) * 100) : 0;
  out.redoRate = out.total > 0 ? Math.round((out.c / out.total) * 100) : 0;
  out.lastGradedAt = lastTs > 0 ? new Date(lastTs).toISOString() : null;
  return out;
}
