import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, ArrowRight, ClipboardList } from "lucide-react";
import {
  CompletionBar,
  GradeDistributionBar,
  GradeLegend,
  IssueBadge,
  KpiTile,
  LetterGradeCell,
  MiniAvatar,
  StatusPill,
  type StatusTone,
} from "@/components/dashboard/ProgressPrimitives";
import {
  aggregateGrades,
  emptyAggregate,
  formatRelative,
  type GradeAggregate,
  type GradedRow,
} from "@/lib/grade-utils";
import { combineAggregates } from "@/lib/grade-summary";
import { computeMemberRisk } from "@/lib/progress-signals";
import {
  fetchCompletionSummary,
  fetchOverdueCounts,
  type UserCompletionSummary,
} from "@/lib/completion-summary";
import { MemberGradeReport } from "@/components/MemberGradeReport";

export const Route = createFileRoute("/incharge/")({
  component: InchargeDashboard,
  errorComponent: InchargeDashboardError,
});

function InchargeDashboardError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <h2 className="text-lg font-semibold">Couldn't load incharge dashboard</h2>
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

interface MemberRowData {
  id: string;
  fullName: string | null;
  agg: GradeAggregate;
  completion: UserCompletionSummary | null;
  lastActivityAt: string | null;
  overdue: number;
  pendingCount: number;
  issues: { label: string; tone: "rose" | "amber" }[];
  status: StatusTone;
}

interface CourseInfo {
  id: string;
  title: string;
}

interface QueueRow {
  submissionId: string;
  memberId: string;
  memberName: string | null;
  courseTitle: string | null;
  lessonTitle: string | null;
  daysWaiting: number;
}

interface FranchisePerformance {
  franchiseId: string | null;
  franchiseName: string | null;
  members: MemberRowData[];
  courses: CourseInfo[];
  agg: GradeAggregate;
  pendingCount: number;
  graded7d: number;
  redos7d: number;
  oldestPendingDays: number | null;
  avgCompletion: number;
  queue: QueueRow[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchInchargeData(
  franchiseId: string | null,
  selfId: string | undefined,
): Promise<FranchisePerformance> {
  if (!franchiseId) {
    return {
      franchiseId: null,
      franchiseName: null,
      members: [],
      courses: [],
      agg: emptyAggregate(),
      pendingCount: 0,
      graded7d: 0,
      redos7d: 0,
      oldestPendingDays: null,
      avgCompletion: 0,
      queue: [],
    };
  }

  const [{ data: franchise }, { data: profs }, { data: roleRows }] = await Promise.all([
    supabase.from("franchises").select("name").eq("id", franchiseId).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("franchise_id", franchiseId),
    supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("franchise_id", franchiseId)
      .eq("role", "member"),
  ]);

  const memberIdSet = new Set((roleRows ?? []).map((r) => r.user_id));
  const memberList = (profs ?? [])
    .filter((p) => memberIdSet.has(p.id) && p.id !== selfId)
    .map((p) => ({ id: p.id, full_name: p.full_name }))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  const userIds = memberList.map((m) => m.id);

  if (userIds.length === 0) {
    return {
      franchiseId,
      franchiseName: franchise?.name ?? null,
      members: [],
      courses: [],
      agg: emptyAggregate(),
      pendingCount: 0,
      graded7d: 0,
      redos7d: 0,
      oldestPendingDays: null,
      avgCompletion: 0,
      queue: [],
    };
  }

  const [{ data: subs }, { data: sessions }] = await Promise.all([
    supabase
      .from("submissions")
      .select(
        "id,user_id,lesson_id,status,letter_grade,grade,feedback,created_at,reviewed_at,reviewed_by",
      )
      .in("user_id", userIds),
    supabase
      .from("study_sessions")
      .select("user_id,started_at")
      .in("user_id", userIds)
      .order("started_at", { ascending: false })
      .limit(2000),
  ]);

  const allRows = (subs ?? []) as GradedRow[];

  const completion = await fetchCompletionSummary({ userIds });
  const overdue = await fetchOverdueCounts(userIds, completion.byUser);

  // Pending lessons → titles + course titles, for the queue
  const pendingRows = allRows.filter((r) => r.status === "pending");
  const lessonIdsForQueue = Array.from(new Set(pendingRows.map((r) => r.lesson_id).filter((id): id is string => !!id)));
  const { data: lessonsForQueue } = lessonIdsForQueue.length
    ? await supabase
        .from("lessons")
        .select("id,title,sections(course_id,courses(id,title))")
        .in("id", lessonIdsForQueue)
    : { data: [] as Array<{
        id: string;
        title: string;
        sections: { course_id: string; courses: { id: string; title: string } | null } | null;
      }> };
  const lessonInfoMap = new Map<
    string,
    { title: string; courseId: string | null; courseTitle: string | null }
  >();
  for (const l of (lessonsForQueue ?? []) as Array<{
    id: string;
    title: string;
    sections: { course_id: string; courses: { id: string; title: string } | null } | null;
  }>) {
    lessonInfoMap.set(l.id, {
      title: l.title,
      courseId: l.sections?.course_id ?? null,
      courseTitle: l.sections?.courses?.title ?? null,
    });
  }

  const queue: QueueRow[] = pendingRows
    .map((r) => {
      const info = r.lesson_id ? lessonInfoMap.get(r.lesson_id) : undefined;
      const days = Math.floor((Date.now() - new Date(r.created_at).getTime()) / DAY_MS);
      const member = memberList.find((m) => m.id === r.user_id);
      return {
        submissionId: r.id,
        memberId: r.user_id,
        memberName: member?.full_name ?? null,
        courseTitle: info?.courseTitle ?? null,
        lessonTitle: info?.title ?? null,
        daysWaiting: days,
      };
    })
    .sort((a, b) => b.daysWaiting - a.daysWaiting);

  // Per-member submissions
  const subsByUser = new Map<string, GradedRow[]>();
  for (const r of allRows) {
    const arr = subsByUser.get(r.user_id) ?? [];
    arr.push(r);
    subsByUser.set(r.user_id, arr);
  }
  const aggByUser = new Map<string, GradeAggregate>();
  for (const m of memberList) aggByUser.set(m.id, aggregateGrades(subsByUser.get(m.id) ?? []));

  // Last activity
  const lastActivity = new Map<string, string | null>();
  for (const m of memberList) lastActivity.set(m.id, null);
  for (const s of (sessions ?? []) as { user_id: string; started_at: string }[]) {
    const cur = lastActivity.get(s.user_id);
    if (!cur || new Date(s.started_at) > new Date(cur)) {
      lastActivity.set(s.user_id, s.started_at);
    }
  }
  for (const m of memberList) {
    const t = (subsByUser.get(m.id) ?? [])
      .map((r) => r.reviewed_at ?? r.created_at)
      .filter(Boolean)
      .sort()
      .pop() as string | undefined;
    const cur = lastActivity.get(m.id);
    if (t && (!cur || new Date(t) > new Date(cur))) lastActivity.set(m.id, t);
  }

  // Build member rows
  const members: MemberRowData[] = memberList.map((m) => {
    const agg = aggByUser.get(m.id) ?? emptyAggregate();
    const lastAct = lastActivity.get(m.id) ?? null;
    const signal = computeMemberRisk(agg, lastAct);
    const od = overdue.get(m.id) ?? 0;
    const compSummary = completion.byUser.get(m.id) ?? null;
    const compPct = compSummary?.overallPct ?? 0;
    const pendingCount = (subsByUser.get(m.id) ?? []).filter((r) => r.status === "pending").length;

    const issues: { label: string; tone: "rose" | "amber" }[] = [];
    if (od > 0) issues.push({ label: `${od} overdue`, tone: "rose" });
    if (signal.daysSinceActivity !== null && signal.daysSinceActivity >= 14) {
      issues.push({ label: `No login ${signal.daysSinceActivity}d`, tone: "rose" });
    } else if (signal.daysSinceActivity !== null && signal.daysSinceActivity >= 7) {
      issues.push({ label: `No login ${signal.daysSinceActivity}d`, tone: "amber" });
    }
    if (agg.total > 0 && agg.averagePercent < 70) {
      issues.push({ label: `Low avg ${agg.averagePercent}%`, tone: "rose" });
    }
    if (compPct > 0 && compPct < 30) {
      issues.push({ label: `Stuck ${compPct}%`, tone: "amber" });
    }

    let status: StatusTone;
    if (signal.level === "at_risk" || issues.some((i) => i.tone === "rose")) status = "at_risk";
    else if (signal.level === "watch" || issues.length > 0) status = "watch";
    else if (compPct >= 80 && agg.averagePercent >= 85) status = "strong";
    else if (compPct > 0 || agg.total > 0) status = "good";
    else status = "not_started";

    return {
      id: m.id,
      fullName: m.full_name,
      agg,
      completion: compSummary,
      lastActivityAt: lastAct,
      overdue: od,
      pendingCount,
      issues,
      status,
    };
  });

  // Sort: at_risk first, then watch, then by completion desc
  const order: Record<StatusTone, number> = {
    at_risk: 0, watch: 1, not_started: 2, good: 3, strong: 4,
    on_track: 3, active: 3, slow: 2, completed: 4, in_progress: 3,
    due_soon: 2, overdue: 0, pending: 2, new: 3, urgent: 0, review: 2,
  };
  members.sort((a, b) => {
    const d = order[a.status] - order[b.status];
    if (d !== 0) return d;
    return (b.completion?.overallPct ?? 0) - (a.completion?.overallPct ?? 0);
  });

  // Course list — every course referenced by completion data
  const courses: CourseInfo[] = Array.from(completion.byCourse.values())
    .map((c) => ({ id: c.courseId, title: c.title }))
    .sort((a, b) => a.title.localeCompare(b.title));

  // Stats
  const sevenAgo = Date.now() - 7 * DAY_MS;
  let g7 = 0;
  let r7 = 0;
  let oldestPending: number | null = null;
  for (const r of allRows) {
    if (r.status === "pending") {
      const d = Math.floor((Date.now() - new Date(r.created_at).getTime()) / DAY_MS);
      if (oldestPending === null || d > oldestPending) oldestPending = d;
    } else if (r.reviewed_at) {
      const t = new Date(r.reviewed_at).getTime();
      if (t >= sevenAgo) {
        g7++;
        if ((r.letter_grade ?? "").trim() === "C") r7++;
      }
    }
  }

  const pendingCount = allRows.filter((r) => r.status === "pending").length;

  return {
    franchiseId,
    franchiseName: franchise?.name ?? null,
    members,
    courses,
    agg: combineAggregates(aggByUser.values()),
    pendingCount,
    graded7d: g7,
    redos7d: r7,
    oldestPendingDays: oldestPending,
    avgCompletion: completion.overallAvgPct,
    queue,
  };
}

function InchargeDashboard() {
  const { profile, roles, user } = useAuth();
  const [drillMember, setDrillMember] = React.useState<{ id: string; full_name: string | null } | null>(null);

  // Resolve a franchise id (CEO can preview the first one)
  const franchiseQuery = useQuery({
    queryKey: ["incharge", "franchise-id", profile?.franchise_id, roles.join(",")],
    queryFn: async () => {
      if (profile?.franchise_id) return profile.franchise_id;
      if (roles.includes("ceo")) {
        const { data } = await supabase
          .from("franchises")
          .select("id")
          .is("archived_at", null)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        return data?.id ?? null;
      }
      return null;
    },
  });

  const dataQuery = useQuery({
    queryKey: ["incharge", "data", franchiseQuery.data, user?.id],
    queryFn: () => fetchInchargeData(franchiseQuery.data ?? null, user?.id),
    enabled: !!franchiseQuery.data,
  });

  const data = dataQuery.data;
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {data?.franchiseName ?? "Your franchise"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome
            {profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} ·
            franchise training overview
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Training Progress · {monthLabel}
        </p>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label="Members" value={data?.members.length ?? "—"} tone="indigo" />
        <KpiTile
          label="Avg Training Completion"
          value={data ? `${data.avgCompletion}%` : "—"}
          subtitle="Across assigned courses"
          tone={
            !data ? "neutral"
            : data.avgCompletion >= 75 ? "emerald"
            : data.avgCompletion >= 50 ? "sky" : "amber"
          }
        />
        <KpiTile
          label="Avg Grade"
          value={data ? `${data.agg.averagePercent}%` : "—"}
          subtitle={`Pass rate ${data?.agg.passRate ?? 0}%`}
          tone={
            !data ? "neutral"
            : data.agg.averagePercent >= 85 ? "emerald"
            : data.agg.averagePercent >= 75 ? "sky" : "amber"
          }
        />
        <KpiTile
          label="Pending to Grade"
          value={data?.pendingCount ?? "—"}
          subtitle={
            data?.oldestPendingDays !== null && data?.oldestPendingDays !== undefined
              ? `Oldest: ${data.oldestPendingDays}d`
              : "Caught up"
          }
          tone={(data?.pendingCount ?? 0) > 0 ? "amber" : "emerald"}
        />
      </div>

      {/* Member training progress matrix */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle className="text-base">Member training progress</CardTitle>
              <CardDescription>
                Completion per course · grade distribution · status
              </CardDescription>
            </div>
            <GradeLegend />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[200px]">Member</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead>Avg Grade</TableHead>
                  <TableHead>Distribution</TableHead>
                  {data?.courses.map((c) => (
                    <TableHead key={c.id} className="min-w-[140px]">
                      <span className="line-clamp-1 text-[11px] font-medium">{c.title}</span>
                    </TableHead>
                  ))}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last activity</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.members ?? []).map((m) => {
                  const letter =
                    m.agg.averagePercent >= 90 ? "A+"
                    : m.agg.averagePercent >= 85 ? "A"
                    : m.agg.averagePercent >= 75 ? "B"
                    : m.agg.averagePercent > 0 ? "C" : null;
                  return (
                    <TableRow key={m.id} className="hover:bg-white/[0.02]">
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <MiniAvatar name={m.fullName} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">
                              {m.fullName ?? "Unnamed"}
                            </div>
                            {m.issues.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {m.issues.slice(0, 2).map((iss, i) => (
                                  <IssueBadge key={i} label={iss.label} tone={iss.tone} />
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <CompletionBar pct={m.completion?.overallPct ?? 0} width={100} />
                      </TableCell>
                      <TableCell>
                        <LetterGradeCell letter={letter} percent={m.agg.averagePercent} />
                      </TableCell>
                      <TableCell>
                        <GradeDistributionBar agg={m.agg} width={100} />
                      </TableCell>
                      {(data?.courses ?? []).map((c) => {
                        const cell = m.completion?.byCourse.get(c.id);
                        if (!cell) {
                          return (
                            <TableCell key={c.id}>
                              <span className="text-xs text-muted-foreground">—</span>
                            </TableCell>
                          );
                        }
                        return (
                          <TableCell key={c.id}>
                            <CompletionBar pct={cell.pct} width={90} />
                            <div className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                              {cell.done}/{cell.total} lessons
                            </div>
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <StatusPill tone={m.status} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatRelative(m.lastActivityAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDrillMember({ id: m.id, full_name: m.fullName })}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(data?.members.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={(data?.courses.length ?? 0) + 7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      {dataQuery.isLoading ? "Loading members…" : "No members in your franchise yet."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Two-column: grade queue + this week */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-end justify-between gap-2">
              <div>
                <CardTitle className="text-base">Grading queue</CardTitle>
                <CardDescription>
                  Pending submissions, oldest first.
                </CardDescription>
              </div>
              <Link to="/incharge/reviews">
                <Button size="sm" variant="ghost">
                  Open queue <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {(data?.queue.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Caught up — nothing pending. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {(data?.queue ?? []).slice(0, 8).map((q) => {
                  const tone: StatusTone =
                    q.daysWaiting >= 5 ? "urgent"
                    : q.daysWaiting >= 3 ? "review"
                    : "new";
                  return (
                    <li key={q.submissionId} className="flex items-center gap-3 py-2.5">
                      <StatusPill tone={tone} label={`${q.daysWaiting}d`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {q.memberName ?? "Unnamed"}
                          <span className="text-muted-foreground"> · {q.lessonTitle ?? "lesson"}</span>
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {q.courseTitle ?? "—"}
                        </div>
                      </div>
                      <Button asChild size="sm" variant="ghost">
                        <Link to="/incharge/reviews">
                          Review <ArrowRight className="h-3 w-3" />
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">This week</CardTitle>
            <CardDescription>Last 7 days of grading.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0">
            <Stat label="Submissions graded" value={data?.graded7d ?? 0} />
            <Stat
              label="Redos issued"
              value={data?.redos7d ?? 0}
              tone={(data?.redos7d ?? 0) > 0 ? "rose" : "default"}
            />
            <Stat
              label="Pending now"
              value={data?.pendingCount ?? 0}
              suffix={
                data?.oldestPendingDays !== null && data?.oldestPendingDays !== undefined
                  ? `oldest ${data.oldestPendingDays}d`
                  : undefined
              }
              tone={
                data?.oldestPendingDays !== null && (data?.oldestPendingDays ?? 0) >= 3
                  ? "rose" : "amber"
              }
            />
            <Button asChild variant="outline" size="sm" className="mt-2 w-full">
              <Link to="/incharge/reviews">
                <ClipboardList className="h-3.5 w-3.5" />
                Open review queue
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!drillMember} onOpenChange={(o) => !o && setDrillMember(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Member grade report</DialogTitle>
          </DialogHeader>
          {drillMember && (
            <MemberGradeReport
              userId={drillMember.id}
              fullName={drillMember.full_name}
              franchiseName={data?.franchiseName ?? null}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: "default" | "amber" | "rose";
}) {
  const cls =
    tone === "rose" ? "text-rose-400"
    : tone === "amber" ? "text-amber-400"
    : "text-foreground";
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm tabular-nums">
        <span className={`font-semibold ${cls}`}>{value}</span>
        {suffix && <span className="ml-1.5 text-xs text-muted-foreground">· {suffix}</span>}
      </span>
    </div>
  );
}
