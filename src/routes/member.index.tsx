import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Clock,
  AlertCircle,
  Play,
  Sparkles,
  Flame,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CompletionBar,
  GradeDistributionBar,
  GradeLegend,
  IssueBadge,
  KpiTile,
  LetterGradeCell,
  StatusPill,
  type StatusTone,
} from "@/components/dashboard/ProgressPrimitives";
import {
  fetchAggregateForUser,
  fetchGradeSummaries,
  combineAggregates,
} from "@/lib/grade-summary";
import { emptyAggregate, type GradeAggregate } from "@/lib/grade-utils";
import { fetchCompletionSummary } from "@/lib/completion-summary";

export const Route = createFileRoute("/member/")({
  validateSearch: (search: Record<string, unknown>): { previewMember?: string } =>
    typeof search.previewMember === "string" ? { previewMember: search.previewMember } : {},
  component: MemberHome,
});

type AssignmentRow = {
  id: string;
  course_id: string;
  priority: "mandatory" | "recommended";
  deadline: string | null;
  courses: {
    id: string;
    title: string;
    description: string | null;
    thumbnail_url: string | null;
  } | null;
};

type CourseStat = {
  total: number;
  done: number;
  lastTouched: string | null;
};

type EnrichedAssignment = AssignmentRow & {
  stat: CourseStat;
  pct: number;
  overdue: boolean;
  dueSoon: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function MemberHome() {
  const { user, profile } = useAuth();
  const { previewMember } = useSearch({ from: "/member/" });
  const effectiveUserId = previewMember ?? user?.id;
  const [loading, setLoading] = React.useState(true);
  const [assignments, setAssignments] = React.useState<AssignmentRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, CourseStat>>({});
  const [gradeAgg, setGradeAgg] = React.useState<GradeAggregate>(emptyAggregate());
  const [peer, setPeer] = React.useState<{ franchiseAvg: number; rank: number | null; total: number; franchiseCompletion: number } | null>(null);
  const [hoursStudied, setHoursStudied] = React.useState(0);
  const [streakDays, setStreakDays] = React.useState(0);
  const [activeDays, setActiveDays] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!effectiveUserId) return;
    fetchAggregateForUser(effectiveUserId).then(setGradeAgg);
  }, [effectiveUserId]);

  // Peer comparison (avg + rank + franchise completion)
  React.useEffect(() => {
    if (!effectiveUserId || !profile?.franchise_id) {
      setPeer(null);
      return;
    }
    (async () => {
      try {
        const { data: peers } = await supabase
          .from("profiles")
          .select("id")
          .eq("franchise_id", profile.franchise_id!);
        const ids = (peers ?? []).map((p) => p.id);
        if (ids.length === 0) return;
        const [summaries, completion] = await Promise.all([
          fetchGradeSummaries(ids),
          fetchCompletionSummary({ userIds: ids }),
        ]);
        const myAgg = summaries.get(effectiveUserId) ?? emptyAggregate();
        const franchiseAgg = combineAggregates(summaries.values());
        const ranked = ids
          .map((id) => ({ id, avg: (summaries.get(id) ?? emptyAggregate()).averagePercent }))
          .filter((r) => r.avg > 0)
          .sort((a, b) => b.avg - a.avg);
        const idx = ranked.findIndex((r) => r.id === effectiveUserId);
        setPeer({
          franchiseAvg: franchiseAgg.averagePercent,
          franchiseCompletion: completion.overallAvgPct,
          rank: idx >= 0 && myAgg.total > 0 ? idx + 1 : null,
          total: ranked.length,
        });
      } catch (e) {
        console.error("peer comparison failed", e);
      }
    })();
  }, [effectiveUserId, profile?.franchise_id]);

  React.useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      setLoading(true);

      const { data: aData, error } = await supabase
        .from("assignments")
        .select("id,course_id,priority,deadline,courses(id,title,description,thumbnail_url)")
        .eq("user_id", effectiveUserId)
        .order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      const seen = new Set<string>();
      const unique: AssignmentRow[] = [];
      for (const a of (aData ?? []) as AssignmentRow[]) {
        if (a.courses && !seen.has(a.course_id)) {
          seen.add(a.course_id);
          unique.push(a);
        }
      }
      setAssignments(unique);

      const courseIds = unique.map((a) => a.course_id);
      if (courseIds.length) {
        const { data: secs } = await supabase
          .from("sections")
          .select("id,course_id")
          .in("course_id", courseIds);
        const sectionIds = (secs ?? []).map((s) => s.id);
        const sectionToCourse = new Map((secs ?? []).map((s) => [s.id, s.course_id]));
        const { data: lessons } = sectionIds.length
          ? await supabase.from("lessons").select("id,section_id").in("section_id", sectionIds)
          : { data: [] as { id: string; section_id: string }[] };
        const lessonToCourse = new Map<string, string>();
        const totals: Record<string, number> = {};
        for (const l of lessons ?? []) {
          const cid = sectionToCourse.get(l.section_id)!;
          lessonToCourse.set(l.id, cid);
          totals[cid] = (totals[cid] ?? 0) + 1;
        }
        const lessonIds = Array.from(lessonToCourse.keys());
        const { data: prog } = lessonIds.length
          ? await supabase
              .from("lesson_progress")
              .select("lesson_id,completed,updated_at")
              .eq("user_id", effectiveUserId)
              .in("lesson_id", lessonIds)
          : { data: [] as { lesson_id: string; completed: boolean; updated_at: string }[] };
        const dones: Record<string, number> = {};
        const lastTouched: Record<string, string | null> = {};
        for (const p of prog ?? []) {
          const cid = lessonToCourse.get(p.lesson_id);
          if (!cid) continue;
          if (p.completed) dones[cid] = (dones[cid] ?? 0) + 1;
          const prev = lastTouched[cid];
          if (!prev || new Date(p.updated_at) > new Date(prev)) {
            lastTouched[cid] = p.updated_at;
          }
        }
        const map: Record<string, CourseStat> = {};
        for (const cid of courseIds) {
          map[cid] = {
            total: totals[cid] ?? 0,
            done: dones[cid] ?? 0,
            lastTouched: lastTouched[cid] ?? null,
          };
        }
        setStats(map);
      } else {
        setStats({});
      }

      const fourteenAgo = new Date(Date.now() - 14 * DAY_MS).toISOString();
      const { data: sess } = await supabase
        .from("study_sessions")
        .select("active_seconds,started_at")
        .eq("user_id", effectiveUserId)
        .gte("started_at", fourteenAgo);
      let totalSec = 0;
      const dayKeys = new Set<string>();
      for (const s of sess ?? []) {
        totalSec += s.active_seconds ?? 0;
        dayKeys.add(new Date(s.started_at).toISOString().slice(0, 10));
      }
      setHoursStudied(Math.round((totalSec / 3600) * 10) / 10);
      setActiveDays(dayKeys);
      let streak = 0;
      for (let i = 0; i < 14; i++) {
        const d = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
        if (dayKeys.has(d)) streak++;
        else if (i > 0) break;
      }
      setStreakDays(streak);

      setLoading(false);
    })();
  }, [effectiveUserId]);

  // Per-lesson grades for "course → letter grade" cells
  const submissionsQuery = useQuery({
    queryKey: ["member", "submissions", effectiveUserId],
    queryFn: async () => {
      if (!effectiveUserId) return [] as Array<{ lesson_id: string; letter_grade: string | null; status: string }>;
      const { data } = await supabase
        .from("submissions")
        .select("lesson_id,letter_grade,status")
        .eq("user_id", effectiveUserId);
      return data ?? [];
    },
    enabled: !!effectiveUserId,
  });

  // Map lesson → course for the submissions
  const courseLetterMap = React.useMemo(() => {
    const out = new Map<string, { letter: string | null; pct: number; pending: number }>();
    return out;
  }, []);

  // We compute letter per course by averaging numeric % of letter grades.
  const lessonCourseQuery = useQuery({
    queryKey: ["member", "lesson-course", assignments.map((a) => a.course_id).join(",")],
    queryFn: async () => {
      const courseIds = assignments.map((a) => a.course_id);
      if (courseIds.length === 0) return new Map<string, string>();
      const { data: secs } = await supabase
        .from("sections")
        .select("id,course_id")
        .in("course_id", courseIds);
      const sectionToCourse = new Map((secs ?? []).map((s) => [s.id, s.course_id]));
      const sectionIds = Array.from(sectionToCourse.keys());
      const { data: lessons } = sectionIds.length
        ? await supabase.from("lessons").select("id,section_id").in("section_id", sectionIds)
        : { data: [] as { id: string; section_id: string }[] };
      const map = new Map<string, string>();
      for (const l of lessons ?? []) {
        const cid = sectionToCourse.get(l.section_id);
        if (cid) map.set(l.id, cid);
      }
      return map;
    },
    enabled: assignments.length > 0,
  });

  const courseGrades = React.useMemo(() => {
    const out = new Map<string, { letter: string | null; pct: number; pending: number }>();
    const lessonToCourse = lessonCourseQuery.data;
    if (!lessonToCourse) return out;
    const acc = new Map<string, { sum: number; n: number; pending: number }>();
    for (const s of submissionsQuery.data ?? []) {
      const cid = lessonToCourse.get(s.lesson_id);
      if (!cid) continue;
      const cur = acc.get(cid) ?? { sum: 0, n: 0, pending: 0 };
      if (s.status === "pending") cur.pending++;
      else {
        const l = (s.letter_grade ?? "").trim();
        const pct = l === "A+" ? 90 : l === "A" ? 85 : l === "B" ? 75 : l === "C" ? 0 : null;
        if (pct !== null) {
          cur.sum += pct;
          cur.n++;
        }
      }
      acc.set(cid, cur);
    }
    for (const [cid, v] of acc) {
      const pct = v.n > 0 ? Math.round(v.sum / v.n) : 0;
      const letter =
        pct >= 90 ? "A+" : pct >= 85 ? "A" : pct >= 75 ? "B" : pct > 0 ? "C" : null;
      out.set(cid, { letter, pct, pending: v.pending });
    }
    return out;
  }, [submissionsQuery.data, lessonCourseQuery.data]);

  const now = Date.now();
  const enriched: EnrichedAssignment[] = assignments.map((a) => {
    const s = stats[a.course_id] ?? { total: 0, done: 0, lastTouched: null };
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const overdue = !!(a.deadline && new Date(a.deadline).getTime() < now && pct < 100);
    const dueSoon = !!(
      a.deadline &&
      !overdue &&
      new Date(a.deadline).getTime() - now < 7 * DAY_MS &&
      pct < 100
    );
    return { ...a, stat: s, pct, overdue, dueSoon };
  });

  const inProgress = enriched
    .filter((e) => e.pct > 0 && e.pct < 100)
    .sort((a, b) => {
      const ta = a.stat.lastTouched ? new Date(a.stat.lastTouched).getTime() : 0;
      const tb = b.stat.lastTouched ? new Date(b.stat.lastTouched).getTime() : 0;
      return tb - ta;
    });
  const notStarted = enriched.filter((e) => e.pct === 0);
  const completed = enriched.filter((e) => e.pct === 100);
  const overdue = enriched.filter((e) => e.overdue);
  const upcoming = enriched
    .filter((e) => e.deadline && e.pct < 100)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
    .slice(0, 4);

  const continueCourse = inProgress[0] ?? notStarted[0] ?? null;
  const firstName =
    profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";
  const overallPct = enriched.length
    ? Math.round(enriched.reduce((s, e) => s + e.pct, 0) / enriched.length)
    : 0;

  function statusFor(e: EnrichedAssignment): StatusTone {
    if (e.pct === 100) return "completed";
    if (e.overdue) return "overdue";
    if (e.dueSoon) return "due_soon";
    if (e.pct > 0) return "in_progress";
    return "not_started";
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Welcome back, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {streakDays > 1
              ? `You're on a ${streakDays}-day learning streak. Keep the momentum.`
              : enriched.length === 0
                ? "Your learning journey starts here."
                : "Pick up where you left off."}
          </p>
        </div>
        {overdue.length > 0 && (
          <Badge variant="destructive" className="gap-1.5">
            <AlertCircle className="h-3 w-3" />
            {overdue.length} overdue
          </Badge>
        )}
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile
          label="My Completion"
          value={`${overallPct}%`}
          subtitle={`${completed.length} / ${enriched.length} courses done`}
          tone={overallPct >= 75 ? "emerald" : overallPct >= 50 ? "sky" : "amber"}
        />
        <KpiTile
          label="My Avg Grade"
          value={gradeAgg.total > 0 ? `${gradeAgg.averagePercent}%` : "—"}
          subtitle={gradeAgg.total > 0 ? `${gradeAgg.total} graded` : "No grades yet"}
          tone={
            gradeAgg.total === 0 ? "neutral"
            : gradeAgg.averagePercent >= 85 ? "emerald"
            : gradeAgg.averagePercent >= 75 ? "sky" : "amber"
          }
        />
        <KpiTile
          label="Streak"
          value={streakDays}
          subtitle={`${hoursStudied}h in last 14d`}
          tone={streakDays >= 3 ? "emerald" : streakDays > 0 ? "sky" : "neutral"}
        />
        <KpiTile
          label="My Rank"
          value={peer?.rank ? `#${peer.rank}` : "—"}
          subtitle={peer ? `of ${peer.total} in franchise` : "—"}
          tone={peer?.rank && peer.rank <= 3 ? "emerald" : "indigo"}
        />
      </div>

      {/* Where you stand */}
      {gradeAgg.total > 0 && peer && (
        <Card className="border-indigo-500/20 bg-gradient-to-br from-indigo-500/[0.04] to-emerald-500/[0.04]">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Where you stand</CardTitle>
            <CardDescription>
              Your numbers vs. franchise average.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <StandRow
                label="Avg grade"
                you={gradeAgg.averagePercent}
                them={peer.franchiseAvg}
              />
              <StandRow
                label="Course completion"
                you={overallPct}
                them={peer.franchiseCompletion}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two-column: training table + activity rail */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Continue learning hero */}
          {loading ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                Loading your courses…
              </CardContent>
            </Card>
          ) : continueCourse ? (
            <ContinueLearningHero a={continueCourse} />
          ) : (
            <EmptyState />
          )}

          {/* My training progress table */}
          {enriched.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">My training progress</CardTitle>
                    <CardDescription>
                      Every assigned course at a glance.
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
                        <TableHead>Course</TableHead>
                        <TableHead>Completion</TableHead>
                        <TableHead className="text-right">Lessons</TableHead>
                        <TableHead>Grade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Deadline</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {enriched.map((e) => {
                        const cg = courseGrades.get(e.course_id);
                        return (
                          <TableRow key={e.id} className="hover:bg-white/[0.02]">
                            <TableCell>
                              <Link
                                to="/member/courses/$id"
                                params={{ id: e.course_id }}
                                className="font-medium hover:underline"
                              >
                                {e.courses?.title}
                              </Link>
                              {e.priority === "mandatory" && (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Mandatory
                                </span>
                              )}
                              {cg && cg.pending > 0 && (
                                <div className="mt-1">
                                  <IssueBadge label={`${cg.pending} pending`} tone="amber" />
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <CompletionBar pct={e.pct} width={120} />
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                              {e.stat.done}/{e.stat.total}
                            </TableCell>
                            <TableCell>
                              <LetterGradeCell letter={cg?.letter ?? null} percent={cg?.pct ?? 0} />
                            </TableCell>
                            <TableCell>
                              <StatusPill tone={statusFor(e)} />
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">
                              {e.deadline ? format(new Date(e.deadline), "MMM d") : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild size="sm" variant="ghost">
                                <Link to="/member/courses/$id" params={{ id: e.course_id }}>
                                  {e.pct === 0 ? "Start" : e.pct === 100 ? "Review" : "Resume"}
                                  <ArrowRight className="h-3 w-3" />
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Grade distribution */}
          {gradeAgg.total > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">My grade distribution</CardTitle>
                <CardDescription>
                  {gradeAgg.total} graded · pass rate {gradeAgg.passRate}%
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GradeDistributionBar agg={gradeAgg} width={400} />
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <Pill tone="bg-emerald-500" label="A+" count={gradeAgg.aPlus} />
                  <Pill tone="bg-sky-500" label="A" count={gradeAgg.a} />
                  <Pill tone="bg-amber-500" label="B" count={gradeAgg.b} />
                  <Pill tone="bg-rose-500" label="C (redo)" count={gradeAgg.c} />
                </div>
                <div className="mt-4">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/member/grades">
                      View grade report <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT RAIL */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Calendar className="h-4 w-4" />
                Last 14 days
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ActivityDots activeDays={activeDays} />
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>Overall progress</span>
                <span className="font-medium text-foreground">{overallPct}%</span>
              </div>
              <Progress value={overallPct} className="mt-1.5 h-1.5" />
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Flame className={`h-3.5 w-3.5 ${streakDays > 1 ? "text-amber-400" : ""}`} />
                {streakDays > 1 ? `${streakDays}-day streak` : "Build a streak — log in daily"}
              </div>
            </CardContent>
          </Card>

          {upcoming.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Upcoming deadlines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {upcoming.map((a) => (
                  <Link
                    key={a.id}
                    to="/member/courses/$id"
                    params={{ id: a.course_id }}
                    className="block rounded-lg border border-white/5 bg-white/[0.02] p-2.5 transition-colors hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-medium">
                        {a.courses?.title}
                      </p>
                      {a.overdue ? (
                        <Badge variant="destructive" className="h-4 px-1 text-[9px]">
                          Overdue
                        </Badge>
                      ) : a.dueSoon ? (
                        <Badge className="h-4 px-1 text-[9px]">Soon</Badge>
                      ) : null}
                    </div>
                    <p
                      className={`mt-0.5 text-[10px] ${
                        a.overdue ? "text-destructive" : "text-muted-foreground"
                      }`}
                    >
                      {format(new Date(a.deadline!), "MMM d")} ·{" "}
                      {formatDistanceToNow(new Date(a.deadline!), { addSuffix: true })}
                    </p>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}

function StandRow({ label, you, them }: { label: string; you: number; them: number }) {
  const diff = you - them;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{you}%</span>
          <span className="ml-1.5 text-muted-foreground">vs {them}%</span>
          <span
            className={`ml-2 ${
              diff > 0 ? "text-emerald-400" : diff < 0 ? "text-rose-400" : "text-muted-foreground"
            }`}
          >
            {diff > 0 ? `+${diff}` : diff}
          </span>
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        <div>
          <div className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">You</div>
          <CompletionBar pct={you} width={140} showLabel={false} />
        </div>
        <div>
          <div className="mb-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">Franchise</div>
          <CompletionBar pct={them} width={140} showLabel={false} muted />
        </div>
      </div>
    </div>
  );
}

function Pill({ tone, label, count }: { tone: string; label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-white/5 bg-white/[0.02] px-2 py-1.5">
      <span className={`h-2 w-2 rounded-sm ${tone}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-semibold tabular-nums">{count}</span>
    </div>
  );
}

/* -------------------- Continue learning hero -------------------- */

function ContinueLearningHero({ a }: { a: EnrichedAssignment }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid sm:grid-cols-[260px_1fr]">
        <div className="relative aspect-video sm:aspect-auto sm:h-full bg-muted">
          {a.courses?.thumbnail_url ? (
            <img
              src={a.courses.thumbnail_url}
              alt={a.courses.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-primary/5">
              <BookOpen className="h-12 w-12 text-primary/50" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-card/40 sm:to-card/80" />
        </div>
        <div className="flex flex-col justify-between gap-4 p-5 sm:p-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-medium uppercase tracking-wider text-primary">
                {a.pct === 0 ? "Start where you left off" : "Continue learning"}
              </span>
            </div>
            <h2 className="font-display text-2xl font-semibold leading-tight">
              {a.courses?.title}
            </h2>
            {a.courses?.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {a.courses.description}
              </p>
            )}
            {a.stat.lastTouched && (
              <p className="text-xs text-muted-foreground">
                Last opened{" "}
                {formatDistanceToNow(new Date(a.stat.lastTouched), { addSuffix: true })}
              </p>
            )}
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {a.stat.done} of {a.stat.total} lessons
                </span>
                <span className="font-medium">{a.pct}%</span>
              </div>
              <Progress value={a.pct} className="h-2" />
            </div>
            <Button asChild size="lg" className="w-fit">
              <Link to="/member/courses/$id" params={{ id: a.course_id }}>
                <Play className="h-4 w-4" />
                {a.pct === 0 ? "Start course" : "Resume lesson"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActivityDots({ activeDays }: { activeDays: Set<string> }) {
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    return { key, active: activeDays.has(key), label: format(d, "EEE d") };
  });
  return (
    <div className="flex items-center gap-1">
      {days.map((d) => (
        <div
          key={d.key}
          title={d.label}
          className={`h-6 flex-1 rounded ${
            d.active ? "bg-primary" : "bg-white/[0.04] border border-white/5"
          }`}
        />
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <BookOpen className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">No courses yet</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Once your incharge or CEO assigns you a course, it will show up here so you can start learning.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
