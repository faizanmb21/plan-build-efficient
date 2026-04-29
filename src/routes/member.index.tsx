import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  BookOpen,
  Clock,
  AlertCircle,
  Play,
  CheckCircle2,
  Sparkles,
  Flame,
  Timer,
  Calendar,
  TrendingUp,
  ArrowRight,
  Trophy,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { GradePieCard } from "@/components/grading/GradePieCard";
import { fetchAggregateForUser, fetchGradeSummaries, combineAggregates } from "@/lib/grade-summary";
import type { GradeAggregate } from "@/lib/grade-utils";
import { emptyAggregate } from "@/lib/grade-utils";

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

function MemberHome() {
  const { user, profile } = useAuth();
  const { previewMember } = useSearch({ from: "/member/" });
  const effectiveUserId = previewMember ?? user?.id;
  const [loading, setLoading] = React.useState(true);
  const [assignments, setAssignments] = React.useState<AssignmentRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, CourseStat>>({});
  const [gradeAgg, setGradeAgg] = React.useState<GradeAggregate>(emptyAggregate());
  const [hoursStudied, setHoursStudied] = React.useState(0);
  const [streakDays, setStreakDays] = React.useState(0);
  const [activeDays, setActiveDays] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!effectiveUserId) return;
    fetchAggregateForUser(effectiveUserId).then(setGradeAgg);
  }, [effectiveUserId]);

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

      const fourteenAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
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
        const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        if (dayKeys.has(d)) streak++;
        else if (i > 0) break;
      }
      setStreakDays(streak);

      setLoading(false);
    })();
  }, [effectiveUserId]);

  const now = Date.now();
  const enriched: EnrichedAssignment[] = assignments.map((a) => {
    const s = stats[a.course_id] ?? { total: 0, done: 0, lastTouched: null };
    const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
    const overdue = !!(a.deadline && new Date(a.deadline).getTime() < now && pct < 100);
    const dueSoon = !!(
      a.deadline &&
      !overdue &&
      new Date(a.deadline).getTime() - now < 7 * 24 * 60 * 60 * 1000 &&
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
    .sort(
      (a, b) =>
        new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime(),
    )
    .slice(0, 4);

  const continueCourse = inProgress[0] ?? notStarted[0] ?? null;

  const firstName =
    profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  const overallPct = enriched.length
    ? Math.round(
        enriched.reduce((s, e) => s + e.pct, 0) / enriched.length,
      )
    : 0;

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
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

      {/* Two-column layout: main + rail */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ======== MAIN COLUMN ======== */}
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

          {/* Tabbed course library */}
          {enriched.length > 0 && (
            <Tabs defaultValue="in-progress" className="space-y-4">
              <TabsList className="bg-white/[0.04] border border-white/10">
                <TabsTrigger value="in-progress" className="gap-1.5">
                  In progress
                  {inProgress.length > 0 && (
                    <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-medium text-primary">
                      {inProgress.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="not-started" className="gap-1.5">
                  Not started
                  {notStarted.length > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-medium">
                      {notStarted.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="completed" className="gap-1.5">
                  Completed
                  {completed.length > 0 && (
                    <span className="rounded-full bg-white/10 px-1.5 text-[10px] font-medium">
                      {completed.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="in-progress" className="m-0">
                {inProgress.length > 0 ? (
                  <CourseGrid items={inProgress} />
                ) : (
                  <BucketEmpty
                    icon={Play}
                    label="Nothing in progress"
                    hint="Start a course from the Not started tab."
                  />
                )}
              </TabsContent>
              <TabsContent value="not-started" className="m-0">
                {notStarted.length > 0 ? (
                  <CourseGrid items={notStarted} />
                ) : (
                  <BucketEmpty
                    icon={BookOpen}
                    label="All caught up"
                    hint="Every assigned course has been started."
                  />
                )}
              </TabsContent>
              <TabsContent value="completed" className="m-0">
                {completed.length > 0 ? (
                  <CourseGrid items={completed} />
                ) : (
                  <BucketEmpty
                    icon={Trophy}
                    label="No completions yet"
                    hint="Finish your first course to earn a spot here."
                  />
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        {/* ======== RIGHT RAIL ======== */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                Your activity
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 pt-0">
              <RailStat icon={BookOpen} value={enriched.length} label="Enrolled" />
              <RailStat
                icon={CheckCircle2}
                value={completed.length}
                label="Completed"
              />
              <RailStat icon={Timer} value={hoursStudied} label="Hours · 14d" />
              <RailStat
                icon={Flame}
                value={streakDays}
                label="Day streak"
                accent={streakDays > 1}
              />
            </CardContent>
          </Card>

          {/* Streak / activity dots */}
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
            </CardContent>
          </Card>

          {/* Upcoming deadlines */}
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

          {/* My grades */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Trophy className="h-4 w-4" />
                My grades
              </CardTitle>
              <CardDescription className="text-[11px]">
                A+ 90% · A 85% · B 75% · C means redo
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3 pt-0">
              <GradePieCard agg={gradeAgg} size={200} />
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link to="/member/grades">
                  View grade report
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
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
                {formatDistanceToNow(new Date(a.stat.lastTouched), {
                  addSuffix: true,
                })}
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

/* -------------------- Course grid + card -------------------- */

function CourseGrid({ items }: { items: EnrichedAssignment[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {items.map((a) => (
        <CourseCard key={a.id} a={a} />
      ))}
    </div>
  );
}

function CourseCard({ a }: { a: EnrichedAssignment }) {
  return (
    <Card interactive className="flex flex-col overflow-hidden">
      <Link
        to="/member/courses/$id"
        params={{ id: a.course_id }}
        className="flex flex-1 flex-col"
      >
        <div className="relative aspect-video w-full bg-muted">
          {a.courses?.thumbnail_url ? (
            <img
              src={a.courses.thumbnail_url}
              alt={a.courses.title ?? ""}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
              <BookOpen className="h-10 w-10 text-primary/40" />
            </div>
          )}
          {a.pct === 100 && (
            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
              <CheckCircle2 className="h-3 w-3" />
              Done
            </div>
          )}
          {a.priority === "mandatory" && a.pct < 100 && (
            <div className="absolute right-2 top-2 rounded-full bg-card/90 px-2 py-0.5 text-[10px] font-medium backdrop-blur">
              Mandatory
            </div>
          )}
        </div>
        <CardContent className="flex flex-1 flex-col gap-3 p-4">
          <div className="flex-1 space-y-1">
            <h3 className="line-clamp-2 font-medium leading-snug">
              {a.courses?.title}
            </h3>
            {a.courses?.description && (
              <p className="line-clamp-2 text-xs text-muted-foreground">
                {a.courses.description}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>
                {a.stat.done}/{a.stat.total} lessons
              </span>
              <span className="font-medium text-foreground">{a.pct}%</span>
            </div>
            <Progress value={a.pct} className="h-1.5" />
          </div>
          {a.deadline && (
            <div
              className={`flex items-center gap-1.5 text-[11px] ${
                a.overdue ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {a.overdue ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              {a.overdue ? "Overdue · " : "Due "}
              {format(new Date(a.deadline), "MMM d")}
            </div>
          )}
        </CardContent>
      </Link>
    </Card>
  );
}

/* -------------------- Right-rail bits -------------------- */

function RailStat({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className={`h-3 w-3 ${accent ? "text-primary" : ""}`} />
        {label}
      </div>
      <div
        className={`mt-1 font-display text-xl font-bold tracking-tight ${
          accent ? "text-primary" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function ActivityDots({ activeDays }: { activeDays: Set<string> }) {
  const days = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date(Date.now() - (13 - i) * 24 * 60 * 60 * 1000);
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
            d.active
              ? "bg-primary"
              : "bg-white/[0.04] border border-white/5"
          }`}
        />
      ))}
    </div>
  );
}

/* -------------------- Empty states -------------------- */

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
            Once your incharge or CEO assigns you a course, it will show up
            here so you can start learning.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function BucketEmpty({
  icon: Icon,
  label,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
        <Icon className="h-6 w-6 text-muted-foreground" />
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
