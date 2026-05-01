import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ArrowRight, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  CompletionBar,
  IssueBadge,
  InchargeScorecard,
  KpiTile,
  LetterGradeCell,
  MiniAvatar,
  type InchargeRow,
} from "@/components/dashboard/ProgressPrimitives";
import {
  InchargeMemberStrip,
  type InchargeBlock,
} from "@/components/ceo/InchargeMemberStrip";
import { FranchisesAndInvitesSection } from "@/components/ceo/FranchisesAndInvitesSection";
import {
  aggregateGrades,
  emptyAggregate,
  type GradeAggregate,
  type GradedRow,
} from "@/lib/grade-utils";
import { combineAggregates } from "@/lib/grade-summary";
import { computeInchargeKpis, computeMemberRisk } from "@/lib/progress-signals";
import { fetchCompletionSummary, fetchOverdueCounts } from "@/lib/completion-summary";

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

async function fetchOrgPerformance(): Promise<OrgPerformance> {
  const [{ data: franchises }, { data: profiles }, { data: roles }, { data: subs }] =
    await Promise.all([
      supabase
        .from("franchises")
        .select("id,name,manager_id")
        .is("archived_at", null)
        .order("name"),
      supabase.from("profiles").select("id,full_name,franchise_id"),
      supabase.from("user_roles").select("user_id,role,franchise_id"),
      supabase
        .from("submissions")
        .select(
          "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
        ),
    ]);

  const memberSet = new Set<string>();
  for (const r of roles ?? []) if (r.role === "member") memberSet.add(r.user_id);

  const profileById = new Map<string, { full_name: string | null; franchise_id: string | null }>();
  for (const p of profiles ?? []) {
    profileById.set(p.id, { full_name: p.full_name, franchise_id: p.franchise_id });
  }

  const memberIds = Array.from(memberSet);
  const allRows = (subs ?? []) as GradedRow[];

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
    new Set(allRows.filter((r) => r.letter_grade).map((r) => r.lesson_id)),
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

  // Per-incharge member roster blocks (for the top-of-dashboard strip)
  const inchargeBlocks: InchargeBlock[] = (franchises ?? [])
    .filter((f) => !!f.manager_id)
    .map((f) => {
      const memberIdsHere = memberIds.filter(
        (id) => profileById.get(id)?.franchise_id === f.id,
      );
      const members = memberIdsHere.map((id) => ({
        userId: id,
        fullName: profileById.get(id)?.full_name ?? null,
        agg: aggByUser.get(id) ?? emptyAggregate(),
        avgCompletion: completion.byUser.get(id)?.overallPct ?? 0,
      }));
      // Sort: graded first by avg desc, then ungraded by name
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
        inchargeName: f.manager_id
          ? profileById.get(f.manager_id)?.full_name ?? null
          : null,
        members,
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

function CeoDashboard() {
  const { profile } = useAuth();
  const perfQuery = useQuery({
    queryKey: ["ceo", "org-performance-v2"],
    queryFn: fetchOrgPerformance,
  });
  const perf = perfQuery.data;

  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            IRM Academy
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} ·
            full academy view
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Training Progress Dashboard · {monthLabel}
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="Total Members"
          value={perf?.totalMembers ?? "—"}
          subtitle={
            perf
              ? `${perf.totalFranchises} ${perf.totalFranchises === 1 ? "franchise" : "franchises"}`
              : undefined
          }
          tone="indigo"
        />
        <KpiTile
          label="Avg Training Completion"
          value={perf ? `${perf.avgCompletion}%` : "—"}
          subtitle="Across all courses"
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
          label="Avg Grade Score"
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

      {/* Incharge & members snapshot — per-incharge roster with grade bars */}
      <InchargeMemberStrip blocks={perf?.inchargeBlocks ?? []} />

      {/* Franchises (cards), New franchise/invite buttons, and Invites list */}
      <FranchisesAndInvitesSection />

      {/* Course bottlenecks */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                Course-level training completion — all franchises
              </CardTitle>
              <CardDescription>Which courses are bottlenecks</CardDescription>
            </div>
            <Link to="/ceo/courses">
              <Button variant="ghost" size="sm">
                Open courses <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead className="text-right">Enrolled</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead>Avg Completion</TableHead>
                  <TableHead>Avg Grade</TableHead>
                  <TableHead>Pass Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(perf?.courses ?? []).map((c) => {
                  const passing =
                    c.agg.total > 0
                      ? c.agg.aPlus + c.agg.a + c.agg.b
                      : 0;
                  const letter =
                    c.agg.averagePercent >= 90
                      ? "A+"
                      : c.agg.averagePercent >= 85
                        ? "A"
                        : c.agg.averagePercent >= 75
                          ? "B"
                          : c.agg.averagePercent > 0
                            ? "C"
                            : null;
                  const passTone =
                    c.agg.total === 0
                      ? "bg-white/8 text-muted-foreground"
                      : passing / c.agg.total >= 0.8
                        ? "bg-emerald-500/15 text-emerald-300"
                        : passing / c.agg.total >= 0.6
                          ? "bg-sky-500/15 text-sky-300"
                          : passing / c.agg.total >= 0.4
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-rose-500/15 text-rose-300";
                  return (
                    <TableRow key={c.id} className="hover:bg-white/[0.02]">
                      <TableCell className="font-medium">{c.title}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.enrolled}</TableCell>
                      <TableCell className="text-right tabular-nums">{c.completed}</TableCell>
                      <TableCell>
                        <CompletionBar pct={c.avgCompletion} width={120} />
                      </TableCell>
                      <TableCell>
                        {c.agg.total > 0 ? (
                          <LetterGradeCell letter={letter} percent={c.agg.averagePercent} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${passTone}`}
                        >
                          {c.agg.total > 0 ? `${passing}/${c.agg.total}` : "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!perf || perf.courses.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {perfQuery.isLoading ? "Loading courses…" : "No courses assigned yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Members needing attention */}
      <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/[0.04] to-rose-500/[0.04]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Members needing attention
              </CardTitle>
              <CardDescription>Overdue, no activity, or failing</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Franchise</TableHead>
                  <TableHead className="text-right">Courses Assigned</TableHead>
                  <TableHead>Avg Completion</TableHead>
                  <TableHead className="text-right">Avg Grade</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(perf?.attention ?? []).slice(0, 12).map((m) => {
                  const tone: "indigo" | "rose" | "amber" =
                    m.issues.some((i) => i.tone === "rose")
                      ? "rose"
                      : "amber";
                  return (
                    <TableRow key={m.userId} className="hover:bg-white/[0.02]">
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <MiniAvatar name={m.fullName} tone={tone} />
                          <span className="font-medium">{m.fullName ?? "—"}</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.franchiseName ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {m.coursesAssigned}
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
                            <IssueBadge key={idx} label={i.label} tone={i.tone} />
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!perf || perf.attention.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      {perfQuery.isLoading
                        ? "Scanning members…"
                        : "Every member across the academy is on track. 🎉"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Incharge scorecard (kept for grader management) */}
      {perf && perf.incharges.length > 0 && <InchargeScorecard rows={perf.incharges} />}
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
