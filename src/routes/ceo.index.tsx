import { createFileRoute, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Sparkles, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type InchargeRow } from "@/components/dashboard/ProgressPrimitives";
import { type InchargeBlock } from "@/components/ceo/InchargeMemberStrip";
import { MemberLiveCard } from "@/components/dashboard/MemberLiveCard";
import { loadLiveBoard, downloadLiveBoardReport } from "@/lib/live-board";

import {
  aggregateGrades,
  emptyAggregate,
  type GradeAggregate,
  type GradedRow,
} from "@/lib/grade-utils";
import { combineAggregates } from "@/lib/grade-summary";
import { computeInchargeKpis, computeMemberRisk } from "@/lib/progress-signals";
import { fetchCompletionSummary, fetchOverdueCounts } from "@/lib/completion-summary";
import { fetchAllGradedRowsVisible } from "@/lib/all-grades";

export const Route = createFileRoute("/ceo/")({
  component: CeoDashboard,
  errorComponent: CeoDashboardError,
});

function CeoDashboardError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold">Couldn't load the dashboard</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        {error?.message || "An unexpected error occurred."}
      </p>
      <Button
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Retry
      </Button>
    </div>
  );
}

interface FranchiseRowData {
  id: string;
  name: string;
  inchargeName: string | null;
  memberCount: number;
  agg: GradeAggregate;
  pendingCount: number;
  avgCompletion: number;
}

interface CourseRow {
  id: string;
  title: string;
  enrolled: number;
  completed: number;
  avgCompletion: number;
  agg: GradeAggregate;
}

interface AttentionRowData {
  userId: string;
  fullName: string | null;
  franchiseName: string | null;
  coursesAssigned: number;
  avgCompletion: number;
  agg: GradeAggregate;
  issues: { label: string; tone: "rose" | "amber" }[];
}

interface OrgPerformance {
  totalMembers: number;
  totalFranchises: number;
  avgCompletion: number;
  org: GradeAggregate;
  pendingTotal: number;
  oldestPendingDays: number | null;
  perFranchise: FranchiseRowData[];
  courses: CourseRow[];
  attention: AttentionRowData[];
  incharges: InchargeRow[];
  inchargeBlocks: InchargeBlock[];
}

export async function fetchOrgPerformance(): Promise<OrgPerformance> {
  const [{ data: franchises }, { data: profiles }, { data: roles }, allGradedRows] =
    await Promise.all([
      supabase
        .from("franchises")
        .select("id,name,manager_id,location,archived_at,auto_delete_at")
        .is("archived_at", null)
        .order("name"),
      supabase.from("profiles").select("id,full_name,franchise_id"),
      supabase.from("user_roles").select("user_id,role,franchise_id"),
      fetchAllGradedRowsVisible(),
    ]);

  const memberSet = new Set<string>();
  for (const r of roles ?? []) if (r.role === "member") memberSet.add(r.user_id);

  const profileById = new Map<string, { full_name: string | null; franchise_id: string | null }>();
  for (const p of profiles ?? []) {
    profileById.set(p.id, { full_name: p.full_name, franchise_id: p.franchise_id });
  }

  const memberIds = Array.from(memberSet);
  const allRows = allGradedRows;

  // Per-member submission rollups
  const subsByUser = new Map<string, GradedRow[]>();
  for (const r of allRows) {
    const arr = subsByUser.get(r.user_id) ?? [];
    arr.push(r);
    subsByUser.set(r.user_id, arr);
  }
  const aggByUser = new Map<string, GradeAggregate>();
  for (const id of memberSet) aggByUser.set(id, aggregateGrades(subsByUser.get(id) ?? []));

  // Last activity (sessions + submissions)
  const { data: sessions } = memberIds.length
    ? await supabase
        .from("study_sessions")
        .select("user_id,started_at")
        .in("user_id", memberIds)
        .order("started_at", { ascending: false })
        .limit(5000)
    : { data: [] as { user_id: string; started_at: string }[] };
  const lastActivityByUser = new Map<string, string | null>();
  for (const id of memberIds) lastActivityByUser.set(id, null);
  for (const s of (sessions ?? []) as { user_id: string; started_at: string }[]) {
    const cur = lastActivityByUser.get(s.user_id);
    if (!cur || new Date(s.started_at) > new Date(cur)) {
      lastActivityByUser.set(s.user_id, s.started_at);
    }
  }
  for (const [uid, rows] of subsByUser) {
    const t = rows
      .map((r) => r.reviewed_at ?? r.created_at)
      .filter(Boolean)
      .sort()
      .pop();
    const cur = lastActivityByUser.get(uid);
    if (t && (!cur || new Date(t) > new Date(cur))) {
      lastActivityByUser.set(uid, t);
    }
  }

  // Completion across the academy
  const completion = await fetchCompletionSummary({ userIds: memberIds });
  const overdue = await fetchOverdueCounts(memberIds, completion.byUser);

  // Courses-assigned count per user (for attention table)
  const coursesAssignedByUser = new Map<string, number>();
  for (const uid of memberIds) {
    coursesAssignedByUser.set(uid, completion.byUser.get(uid)?.byCourse.size ?? 0);
  }

  // Per-franchise rollups
  const perFranchise: FranchiseRowData[] = (franchises ?? []).map((f) => {
    const ids = memberIds.filter(
      (id) => profileById.get(id)?.franchise_id === f.id,
    );
    const aggs = ids.map((id) => aggByUser.get(id) ?? emptyAggregate());
    const agg = combineAggregates(aggs);
    const subsHere = ids.flatMap((id) => subsByUser.get(id) ?? []);
    const pendingCount = subsHere.filter((s) => s.status === "pending").length;
    const inchargeName = f.manager_id
      ? profileById.get(f.manager_id)?.full_name ?? null
      : null;
    const compSum = ids.reduce(
      (s, id) => s + (completion.byUser.get(id)?.overallPct ?? 0),
      0,
    );
    const compCount = ids.filter(
      (id) => (completion.byUser.get(id)?.byCourse.size ?? 0) > 0,
    ).length;
    return {
      id: f.id,
      name: f.name,
      inchargeName,
      memberCount: ids.length,
      agg,
      pendingCount,
      avgCompletion: compCount > 0 ? Math.round(compSum / compCount) : 0,
    };
  });

  // Course rollups: enrolled, completed, avg completion + grade aggregate
  // Need lesson→course map for grade aggregation by course
  const lessonIds = Array.from(
    new Set(
      allRows
        .filter((r) => r.letter_grade && r.lesson_id)
        .map((r) => r.lesson_id as string),
    ),
  );
  const { data: lessons } = lessonIds.length
    ? await supabase
        .from("lessons")
        .select("id,sections(course_id)")
        .in("id", lessonIds)
    : { data: [] as { id: string; sections: { course_id: string } | null }[] };
  const lessonToCourse = new Map<string, string>();
  for (const l of (lessons ?? []) as {
    id: string;
    sections: { course_id: string } | null;
  }[]) {
    if (l.sections?.course_id) lessonToCourse.set(l.id, l.sections.course_id);
  }
  const rowsByCourse = new Map<string, GradedRow[]>();
  for (const r of allRows) {
    if (!memberSet.has(r.user_id)) continue;
    if (!r.lesson_id) continue; // project rows have no course mapping
    const cid = lessonToCourse.get(r.lesson_id);
    if (!cid) continue;
    const arr = rowsByCourse.get(cid) ?? [];
    arr.push(r);
    rowsByCourse.set(cid, arr);
  }

  const courses: CourseRow[] = Array.from(completion.byCourse.entries()).map(
    ([cid, c]) => ({
      id: cid,
      title: c.title,
      enrolled: c.enrolled,
      completed: c.completed,
      avgCompletion: c.avgPct,
      agg: aggregateGrades(rowsByCourse.get(cid) ?? []),
    }),
  );
  courses.sort((a, b) => b.avgCompletion - a.avgCompletion);

  // Attention list — members with issues
  const DAY_MS = 24 * 60 * 60 * 1000;
  const attention: AttentionRowData[] = [];
  for (const id of memberIds) {
    const agg = aggByUser.get(id) ?? emptyAggregate();
    const lastAct = lastActivityByUser.get(id) ?? null;
    const signal = computeMemberRisk(agg, lastAct);
    const od = overdue.get(id) ?? 0;
    const issues: { label: string; tone: "rose" | "amber" }[] = [];
    if (od > 0) issues.push({ label: `${od} overdue`, tone: "rose" });
    if (signal.daysSinceActivity !== null && signal.daysSinceActivity >= 14) {
      issues.push({ label: `No login ${signal.daysSinceActivity}d`, tone: "rose" });
    } else if (signal.daysSinceActivity !== null && signal.daysSinceActivity >= 7) {
      issues.push({ label: `No login ${signal.daysSinceActivity}d`, tone: "amber" });
    }
    if (agg.total > 0 && agg.averagePercent < 70) {
      issues.push({ label: `Low avg ${agg.averagePercent}%`, tone: "rose" });
    } else if (agg.total > 0 && agg.averagePercent < 80) {
      issues.push({ label: `Avg ${agg.averagePercent}%`, tone: "amber" });
    }
    const compPct = completion.byUser.get(id)?.overallPct ?? 0;
    if (compPct > 0 && compPct < 30) {
      issues.push({ label: `Stuck ${compPct}%`, tone: "amber" });
    }
    if (issues.length === 0 && signal.level === "ok") continue;
    if (issues.length === 0) continue;

    const p = profileById.get(id);
    const fr = p?.franchise_id
      ? (franchises ?? []).find((f) => f.id === p.franchise_id)?.name ?? null
      : null;
    attention.push({
      userId: id,
      fullName: p?.full_name ?? null,
      franchiseName: fr,
      coursesAssigned: coursesAssignedByUser.get(id) ?? 0,
      avgCompletion: compPct,
      agg,
      issues,
    });
  }
  attention.sort((a, b) => b.issues.length - a.issues.length);

  // Incharge scorecard
  const incharges: InchargeRow[] = [];
  for (const f of franchises ?? []) {
    if (!f.manager_id) continue;
    const memberIdsHere = memberIds.filter(
      (id) => profileById.get(id)?.franchise_id === f.id,
    );
    const subsHere = memberIdsHere.flatMap((id) => subsByUser.get(id) ?? []);
    const reviewedByThem = subsHere.filter((s) => s.reviewed_by === f.manager_id);
    const pendingHere = subsHere.filter((s) => s.status === "pending");
    const kpis = computeInchargeKpis(f.manager_id, reviewedByThem, pendingHere);
    incharges.push({
      inchargeId: f.manager_id,
      inchargeName: profileById.get(f.manager_id)?.full_name ?? null,
      franchiseName: f.name,
      kpis,
      pendingInFranchise: pendingHere.length,
    });
  }

  // Pending totals + oldest
  let oldestPendingDays: number | null = null;
  let pendingTotal = 0;
  for (const r of allRows) {
    if (r.status !== "pending") continue;
    if (!memberSet.has(r.user_id)) continue;
    pendingTotal++;
    const d = Math.floor((Date.now() - new Date(r.created_at).getTime()) / DAY_MS);
    if (oldestPendingDays === null || d > oldestPendingDays) oldestPendingDays = d;
  }

  const org = combineAggregates(aggByUser.values());

  // Per-franchise overview blocks (donut + member roster) for the top grid
  const aggByFranchise = new Map(perFranchise.map((p) => [p.id, p.agg]));
  const inchargeBlocks: InchargeBlock[] = (franchises ?? []).map((f) => {
    const memberIdsHere = memberIds.filter(
      (id) => profileById.get(id)?.franchise_id === f.id,
    );
    const members = memberIdsHere.map((id) => ({
      userId: id,
      fullName: profileById.get(id)?.full_name ?? null,
      agg: aggByUser.get(id) ?? emptyAggregate(),
      avgCompletion: completion.byUser.get(id)?.overallPct ?? 0,
    }));
    members.sort((a, b) => {
      if (a.agg.total === 0 && b.agg.total === 0) {
        return (a.fullName ?? "").localeCompare(b.fullName ?? "");
      }
      if (a.agg.total === 0) return 1;
      if (b.agg.total === 0) return -1;
      return b.agg.averagePercent - a.agg.averagePercent;
    });
    return {
      franchiseId: f.id,
      franchiseName: f.name,
      location: (f as { location: string | null }).location ?? null,
      inchargeName: f.manager_id
        ? profileById.get(f.manager_id)?.full_name ?? null
        : null,
      agg: aggByFranchise.get(f.id) ?? emptyAggregate(),
      members,
      isArchived: !!(f as { archived_at: string | null }).archived_at,
      archivedAt: (f as { archived_at: string | null }).archived_at ?? null,
      autoDeleteAt: (f as { auto_delete_at: string | null }).auto_delete_at ?? null,
    };
  });

  return {
    totalMembers: memberSet.size,
    totalFranchises: (franchises ?? []).length,
    avgCompletion: completion.overallAvgPct,
    org,
    pendingTotal,
    oldestPendingDays,
    perFranchise,
    courses,
    attention,
    incharges,
    inchargeBlocks,
  };
}

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function CeoDashboard() {
  const { profile } = useAuth();
  const boardQuery = useQuery({
    queryKey: ["ceo", "members-live-board"],
    queryFn: loadLiveBoard,
    refetchInterval: 60_000,
  });
  const board = boardQuery.data;

  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  const firstName = profile?.full_name?.split(" ")[0] ?? "";
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(now);

  const hoursTodayH = board ? Math.round((board.hoursTodaySec / 3600) * 10) / 10 : 0;
  const targetTodayH = board ? Math.round((board.dailyTargetSecSum / 3600) * 10) / 10 : 0;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
        <div>
          <p className="text-sm font-semibold">
            {greeting(now.getHours())}{firstName ? `, ${firstName}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{timeLabel}</p>
        </div>
        <div className="h-8 w-px bg-white/8" />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <span>
            <span className="font-semibold tabular-nums">
              {board?.presentToday ?? "—"}/{board?.totalMembers ?? "—"}
            </span>{" "}
            <span className="text-muted-foreground">present today</span>
          </span>
          <span>
            <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              {board?.workingNow ?? "—"}
            </span>{" "}
            <span className="text-muted-foreground">working now</span>
          </span>
          <span>
            <span className="font-semibold tabular-nums">
              {hoursTodayH}h / {targetTodayH}h
            </span>{" "}
            <span className="text-muted-foreground">hours today vs target</span>
          </span>
          <span>
            <span
              className={cn(
                "font-semibold tabular-nums",
                (board?.pendingReview ?? 0) > 0 ? "text-amber-300" : "text-emerald-300",
              )}
            >
              {board?.pendingReview ?? "—"}
            </span>{" "}
            <span className="text-muted-foreground">pending review</span>
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          disabled={!board}
          onClick={() => board && downloadLiveBoardReport(board)}
        >
          <Download className="h-3.5 w-3.5" />
          Export report
        </Button>
      </div>

      {/* Member grid */}
      {boardQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading members…
        </div>
      ) : !board || board.members.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No members yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {board.members.map((m) => (
            <MemberLiveCard key={m.userId} member={m} />
          ))}
        </div>
      )}
    </div>
  );
}

// Bootstrap helper rendered when no role exists
export function ClaimCeoCard({ onClaimed }: { onClaimed: () => void }) {
  const [busy, setBusy] = React.useState(false);
  async function claim() {
    setBusy(true);
    const { data, error } = await supabase.rpc("claim_first_ceo");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data) {
      toast.error("A CEO already exists. Ask them to invite you.");
      return;
    }
    toast.success("You're now the CEO");
    onClaimed();
  }
  return (
    <Card className="border-accent/40 bg-accent/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-accent" /> Bootstrap your academy
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          No CEO exists yet for this academy. Click below to claim the CEO role for your account.
          (This only works once.)
        </p>
        <Button onClick={claim} disabled={busy}>
          {busy ? "Claiming…" : "Claim CEO role"}
        </Button>
      </CardContent>
    </Card>
  );
}
