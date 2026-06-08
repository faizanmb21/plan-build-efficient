import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  KpiTile,
  MiniAvatar,
  CompletionBar,
  IssueBadge,
} from "@/components/dashboard/ProgressPrimitives";
import {
  InchargeMemberStrip,
  type InchargeBlock,
} from "@/components/ceo/InchargeMemberStrip";
import { MemberGradeReport } from "@/components/MemberGradeReport";
import {
  aggregateGrades,
  emptyAggregate,
  type GradeAggregate,
  type GradedRow,
} from "@/lib/grade-utils";
import { combineAggregates } from "@/lib/grade-summary";
import { computeMemberRisk } from "@/lib/progress-signals";
import {
  fetchCompletionSummary,
  fetchOverdueCounts,
} from "@/lib/completion-summary";

export const Route = createFileRoute("/qa/")({
  component: QaDashboard,
});

interface AttentionRow {
  userId: string;
  fullName: string | null;
  franchiseName: string | null;
  avgCompletion: number;
  agg: GradeAggregate;
  issues: { label: string; tone: "rose" | "amber" }[];
}

interface QaPerformance {
  totalMembers: number;
  totalFranchises: number;
  avgCompletion: number;
  org: GradeAggregate;
  pendingTotal: number;
  oldestPendingDays: number | null;
  inchargeBlocks: InchargeBlock[];
  attention: AttentionRow[];
}

async function fetchQaPerformance(qaUserId: string): Promise<QaPerformance> {
  // QA's assigned franchises
  const { data: assignments } = await supabase
    .from("qa_franchise_assignments")
    .select("franchise_id")
    .eq("user_id", qaUserId);
  const franchiseIds = (assignments ?? []).map((r) => r.franchise_id);

  if (franchiseIds.length === 0) {
    return {
      totalMembers: 0,
      totalFranchises: 0,
      avgCompletion: 0,
      org: emptyAggregate(),
      pendingTotal: 0,
      oldestPendingDays: null,
      inchargeBlocks: [],
      attention: [],
    };
  }

  const [{ data: franchises }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("franchises")
        .select("id,name,manager_id,location,archived_at")
        .in("id", franchiseIds)
        .is("archived_at", null)
        .order("name"),
      supabase
        .from("profiles")
        .select("id,full_name,franchise_id")
        .in("franchise_id", franchiseIds),
    ]);

  const profileById = new Map<
    string,
    { full_name: string | null; franchise_id: string | null }
  >();
  for (const p of profiles ?? []) {
    profileById.set(p.id, { full_name: p.full_name, franchise_id: p.franchise_id });
  }

  const profileIds = Array.from(profileById.keys());

  // Scope roles and submissions to only the users in these franchises
  const [{ data: roles }, { data: subs }] = await Promise.all([
    profileIds.length
      ? supabase.from("user_roles").select("user_id,role").in("user_id", profileIds)
      : Promise.resolve({ data: [] as { user_id: string; role: string }[] }),
    profileIds.length
      ? supabase
          .from("submissions")
          .select(
            "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
          )
          .in("user_id", profileIds)
      : Promise.resolve({ data: [] as GradedRow[] }),
  ]);

  const memberRoleSet = new Set(
    (roles ?? []).filter((r) => r.role === "member").map((r) => r.user_id),
  );

  // Members in scope = profiles in scope AND with member role
  const memberIds = Array.from(profileById.keys()).filter((id) =>
    memberRoleSet.has(id),
  );

  const allRows = (subs ?? []) as GradedRow[];

  const subsByUser = new Map<string, GradedRow[]>();
  for (const r of allRows) {
    if (!profileById.has(r.user_id)) continue; // scope safety
    const arr = subsByUser.get(r.user_id) ?? [];
    arr.push(r);
    subsByUser.set(r.user_id, arr);
  }
  const aggByUser = new Map<string, GradeAggregate>();
  for (const id of memberIds)
    aggByUser.set(id, aggregateGrades(subsByUser.get(id) ?? []));

  // Activity for risk signals
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
    if (!cur || new Date(s.started_at) > new Date(cur))
      lastActivityByUser.set(s.user_id, s.started_at);
  }

  const completion = await fetchCompletionSummary({ userIds: memberIds });
  const overdue = await fetchOverdueCounts(memberIds, completion.byUser);

  // Franchise overview blocks
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
      if (a.agg.total === 0 && b.agg.total === 0)
        return (a.fullName ?? "").localeCompare(b.fullName ?? "");
      if (a.agg.total === 0) return 1;
      if (b.agg.total === 0) return -1;
      return b.agg.averagePercent - a.agg.averagePercent;
    });
    const agg = combineAggregates(memberIdsHere.map((id) => aggByUser.get(id) ?? emptyAggregate()));
    return {
      franchiseId: f.id,
      franchiseName: f.name,
      location: (f as { location: string | null }).location ?? null,
      inchargeName: f.manager_id
        ? profileById.get(f.manager_id)?.full_name ?? null
        : null,
      agg,
      members,
      isArchived: false,
      archivedAt: null,
      autoDeleteAt: null,
    };
  });

  // Attention list
  const DAY_MS = 24 * 60 * 60 * 1000;
  const attention: AttentionRow[] = [];
  for (const id of memberIds) {
    const agg = aggByUser.get(id) ?? emptyAggregate();
    const lastAct = lastActivityByUser.get(id) ?? null;
    const signal = computeMemberRisk(agg, lastAct);
    const od = overdue.get(id) ?? 0;
    const issues: { label: string; tone: "rose" | "amber" }[] = [];
    if (od > 0) issues.push({ label: `${od} overdue`, tone: "rose" });
    if (signal.daysSinceActivity !== null && signal.daysSinceActivity >= 14)
      issues.push({ label: `No login ${signal.daysSinceActivity}d`, tone: "rose" });
    else if (signal.daysSinceActivity !== null && signal.daysSinceActivity >= 7)
      issues.push({ label: `No login ${signal.daysSinceActivity}d`, tone: "amber" });
    if (agg.total > 0 && agg.averagePercent < 70)
      issues.push({ label: `Low avg ${agg.averagePercent}%`, tone: "rose" });
    else if (agg.total > 0 && agg.averagePercent < 80)
      issues.push({ label: `Avg ${agg.averagePercent}%`, tone: "amber" });
    const compPct = completion.byUser.get(id)?.overallPct ?? 0;
    if (compPct > 0 && compPct < 30)
      issues.push({ label: `Stuck ${compPct}%`, tone: "amber" });
    if (issues.length === 0) continue;

    const p = profileById.get(id);
    const fr = p?.franchise_id
      ? (franchises ?? []).find((f) => f.id === p.franchise_id)?.name ?? null
      : null;
    attention.push({
      userId: id,
      fullName: p?.full_name ?? null,
      franchiseName: fr,
      avgCompletion: compPct,
      agg,
      issues,
    });
  }
  attention.sort((a, b) => b.issues.length - a.issues.length);

  // Pending totals
  let pendingTotal = 0;
  let oldestPendingDays: number | null = null;
  for (const r of allRows) {
    if (r.status !== "pending") continue;
    if (!profileById.has(r.user_id)) continue;
    pendingTotal++;
    const d = Math.floor((Date.now() - new Date(r.created_at).getTime()) / DAY_MS);
    if (oldestPendingDays === null || d > oldestPendingDays) oldestPendingDays = d;
  }

  const org = combineAggregates(aggByUser.values());

  return {
    totalMembers: memberIds.length,
    totalFranchises: (franchises ?? []).length,
    avgCompletion: completion.overallAvgPct,
    org,
    pendingTotal,
    oldestPendingDays,
    inchargeBlocks,
    attention,
  };
}

function QaDashboard() {
  const { user, profile } = useAuth();
  const perfQuery = useQuery({
    queryKey: ["qa", "performance", user?.id],
    queryFn: () => fetchQaPerformance(user!.id),
    enabled: !!user?.id,
  });
  const perf = perfQuery.data;

  const [gradeMember, setGradeMember] = React.useState<{
    id: string;
    name: string | null;
    franchiseName: string | null;
  } | null>(null);

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            QA Review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome
            {profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} ·
            your assigned franchises
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          QA Dashboard · {monthLabel}
        </p>
      </header>

      {perfQuery.isLoading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dashboard…
          </CardContent>
        </Card>
      ) : perf && perf.totalFranchises === 0 ? (
        <Card className="border-amber-500/30 bg-amber-500/[0.04]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-amber-400" />
              No franchises assigned yet
            </CardTitle>
            <CardDescription>
              Ask the CEO to assign you to one or more franchises. You'll see member
              progress and pending submissions here once that's done.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              label="Members in scope"
              value={perf?.totalMembers ?? "—"}
              subtitle={
                perf
                  ? `${perf.totalFranchises} ${
                      perf.totalFranchises === 1 ? "franchise" : "franchises"
                    }`
                  : undefined
              }
              tone="indigo"
            />
            <KpiTile
              label="Avg Completion"
              value={perf ? `${perf.avgCompletion}%` : "—"}
              subtitle="Across assigned franchises"
              tone={
                !perf
                  ? "neutral"
                  : perf.avgCompletion >= 75
                    ? "emerald"
                    : perf.avgCompletion >= 50
                      ? "sky"
                      : "amber"
              }
            />
            <KpiTile
              label="Avg Grade"
              value={perf ? `${perf.org.averagePercent}%` : "—"}
              subtitle="All graded submissions"
              tone={
                !perf
                  ? "neutral"
                  : perf.org.averagePercent >= 85
                    ? "emerald"
                    : perf.org.averagePercent >= 75
                      ? "sky"
                      : "amber"
              }
            />
            <KpiTile
              label="Pending to Grade"
              value={perf?.pendingTotal ?? "—"}
              subtitle={
                perf?.oldestPendingDays !== null && perf?.oldestPendingDays !== undefined
                  ? `Oldest: ${perf.oldestPendingDays}d`
                  : "Caught up"
              }
              tone={(perf?.pendingTotal ?? 0) > 0 ? "amber" : "emerald"}
            />
          </div>

          {/* Open queue CTA */}
          <Card className="border-primary/20 bg-primary/[0.04]">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm font-medium">Ready to grade?</p>
                <p className="text-xs text-muted-foreground">
                  Review submissions in a clean split-view workspace.
                </p>
              </div>
              <Button asChild>
                <Link to="/qa/submissions">
                  Open review queue <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* Franchise overview */}
          <InchargeMemberStrip
            blocks={perf?.inchargeBlocks ?? []}
            onMemberClick={(id, name, franchiseName) => setGradeMember({ id, name, franchiseName })}
          />

          {/* Members needing attention */}
          <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-rose-500/[0.04]">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Members needing attention
              </CardTitle>
              <CardDescription>
                Overdue, no activity, or low average grade
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Franchise</TableHead>
                      <TableHead>Avg Completion</TableHead>
                      <TableHead className="text-right">Avg Grade</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(perf?.attention ?? []).slice(0, 12).map((m) => {
                      const tone: "indigo" | "rose" | "amber" = m.issues.some(
                        (i) => i.tone === "rose",
                      )
                        ? "rose"
                        : "amber";
                      return (
                        <TableRow
                          key={m.userId}
                          className="cursor-pointer hover:bg-white/[0.02]"
                          onClick={() =>
                            setGradeMember({ id: m.userId, name: m.fullName, franchiseName: m.franchiseName ?? null })
                          }
                        >
                          <TableCell>
                            <span className="inline-flex items-center gap-2">
                              <MiniAvatar name={m.fullName} tone={tone} />
                              <span className="font-medium">
                                {m.fullName ?? "—"}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {m.franchiseName ?? "—"}
                          </TableCell>
                          <TableCell>
                            <CompletionBar pct={m.avgCompletion} width={110} />
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {m.agg.total > 0 ? (
                              <span
                                className={
                                  m.agg.averagePercent >= 80
                                    ? "text-emerald-400"
                                    : m.agg.averagePercent >= 70
                                      ? "text-amber-400"
                                      : "text-rose-400"
                                }
                              >
                                {m.agg.averagePercent}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {m.issues.slice(0, 2).map((i, idx) => (
                                <IssueBadge
                                  key={idx}
                                  label={i.label}
                                  tone={i.tone}
                                />
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(!perf || perf.attention.length === 0) && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          Every member is on track. 🎉
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog
        open={!!gradeMember}
        onOpenChange={(o) => !o && setGradeMember(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {gradeMember && (
            <MemberGradeReport
              userId={gradeMember.id}
              fullName={gradeMember.name}
              franchiseName={gradeMember.franchiseName}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
