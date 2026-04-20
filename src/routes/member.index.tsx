import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Clock,
  AlertCircle,
  Play,
  CheckCircle2,
  Sparkles,
  Flame,
  GraduationCap,
  Timer,
  ChevronDown,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PillarFlower } from "@/components/PillarFlower";
import { getPillarScoresForUsers } from "@/lib/pillar-data";
import type { PillarScores } from "@/lib/pillars";

export const Route = createFileRoute("/member/")({
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
  lastTouched: string | null; // ISO timestamp of most recent lesson_progress.updated_at
};

function MemberHome() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [assignments, setAssignments] = React.useState<AssignmentRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, CourseStat>>({});
  const [pillarScores, setPillarScores] = React.useState<PillarScores | null>(null);
  const [hoursStudied, setHoursStudied] = React.useState(0);
  const [streakDays, setStreakDays] = React.useState(0);
  const [showFlower, setShowFlower] = React.useState(false);
  const [showCompleted, setShowCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    getPillarScoresForUsers([user.id]).then(setPillarScores);
  }, [user]);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);

      // ---------- Assignments ----------
      const { data: aData, error } = await supabase
        .from("assignments")
        .select("id,course_id,priority,deadline,courses(id,title,description,thumbnail_url)")
        .eq("user_id", user.id)
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

      // ---------- Lesson totals + completion + last-touched ----------
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
              .eq("user_id", user.id)
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

      // ---------- Hours studied + streak (last 14 days) ----------
      const fourteenAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: sess } = await supabase
        .from("study_sessions")
        .select("active_seconds,started_at")
        .eq("user_id", user.id)
        .gte("started_at", fourteenAgo);
      let totalSec = 0;
      const dayKeys = new Set<string>();
      for (const s of sess ?? []) {
        totalSec += s.active_seconds ?? 0;
        dayKeys.add(new Date(s.started_at).toISOString().slice(0, 10));
      }
      setHoursStudied(Math.round((totalSec / 3600) * 10) / 10);
      // streak = consecutive days back from today
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
  }, [user]);

  // ---------- Bucket assignments ----------
  const now = Date.now();
  const enriched = assignments.map((a) => {
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
  const overdueCount = enriched.filter((e) => e.overdue).length;
  const dueSoonCount = enriched.filter((e) => e.dueSoon).length;

  const continueCourse = inProgress[0] ?? notStarted[0] ?? null;

  const firstName =
    profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-8">
      {/* Welcome + stats */}
      <header className="space-y-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Hi {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {streakDays > 1
              ? `You're on a ${streakDays}-day streak — keep it going.`
              : "Ready to learn something new today?"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile
            icon={BookOpen}
            label="Enrolled"
            value={enriched.length}
          />
          <StatTile
            icon={CheckCircle2}
            label="Completed"
            value={completed.length}
          />
          <StatTile
            icon={Timer}
            label="Hours (14d)"
            value={hoursStudied}
          />
          <StatTile
            icon={Flame}
            label="Day streak"
            value={streakDays}
            accent={streakDays > 1}
          />
        </div>
      </header>

      {/* Overdue banner */}
      {overdueCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-medium text-destructive">
              {overdueCount} course{overdueCount > 1 ? "s" : ""} past deadline
            </p>
            <p className="text-xs text-muted-foreground">
              Catch up below to stay on track.
            </p>
          </div>
        </div>
      )}
      {overdueCount === 0 && dueSoonCount > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-600 dark:text-amber-400">
            {dueSoonCount} course{dueSoonCount > 1 ? "s" : ""} due within 7 days.
          </p>
        </div>
      )}

      {/* Continue learning hero */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : continueCourse ? (
        <Card className="overflow-hidden">
          <div className="grid sm:grid-cols-[200px_1fr]">
            <div className="aspect-video sm:aspect-auto sm:h-full bg-muted">
              {continueCourse.courses?.thumbnail_url ? (
                <img
                  src={continueCourse.courses.thumbnail_url}
                  alt={continueCourse.courses.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
                  <BookOpen className="h-10 w-10 text-primary/40" />
                </div>
              )}
            </div>
            <div className="flex flex-col justify-between gap-4 p-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {continueCourse.pct === 0 ? "Pick up where you left off" : "Continue learning"}
                  </span>
                </div>
                <h2 className="font-display text-xl font-semibold">
                  {continueCourse.courses?.title}
                </h2>
                {continueCourse.stat.lastTouched && (
                  <p className="text-xs text-muted-foreground">
                    Last opened{" "}
                    {formatDistanceToNow(new Date(continueCourse.stat.lastTouched), {
                      addSuffix: true,
                    })}
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {continueCourse.stat.done} / {continueCourse.stat.total} lessons
                    </span>
                    <span>{continueCourse.pct}%</span>
                  </div>
                  <Progress value={continueCourse.pct} />
                </div>
                <Button asChild>
                  <Link
                    to="/member/courses/$id"
                    params={{ id: continueCourse.course_id }}
                  >
                    <Play className="h-4 w-4" />
                    {continueCourse.pct === 0 ? "Start course" : "Resume lesson"}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : assignments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No courses assigned yet</CardTitle>
            <CardDescription>
              Once your incharge or CEO assigns a course, it will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {/* In progress */}
      {inProgress.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            label="In progress"
            count={inProgress.length}
            icon={Play}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {inProgress.map((a) => (
              <CourseCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}

      {/* Not started */}
      {notStarted.length > 0 && (
        <section className="space-y-3">
          <SectionHeading
            label="Not started"
            count={notStarted.length}
            icon={BookOpen}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {notStarted.map((a) => (
              <CourseCard key={a.id} a={a} />
            ))}
          </div>
        </section>
      )}

      {/* Completed (collapsed) */}
      {completed.length > 0 && (
        <Collapsible open={showCompleted} onOpenChange={setShowCompleted}>
          <CollapsibleTrigger asChild>
            <button className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-primary" />
                <span className="font-medium">Completed</span>
                <Badge variant="secondary">{completed.length}</Badge>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  showCompleted ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {completed.map((a) => (
                <CourseCard key={a.id} a={a} />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Skill flower (collapsible, compact) */}
      <Collapsible open={showFlower} onOpenChange={setShowFlower}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-colors hover:bg-white/[0.06]">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Your skill flower</span>
              <span className="text-xs text-muted-foreground">
                12 IRM Academy pillars
              </span>
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                showFlower ? "rotate-180" : ""
              }`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-3">
            <CardContent className="flex justify-center pt-6">
              {pillarScores ? (
                <PillarFlower scores={pillarScores} size={260} showLegend />
              ) : (
                <div className="flex h-[260px] w-[260px] items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`h-3.5 w-3.5 ${accent ? "text-orange-400" : ""}`} />
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold tracking-tight">
        {value}
      </div>
    </div>
  );
}

function SectionHeading({
  label,
  count,
  icon: Icon,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="font-display text-lg font-semibold">{label}</h2>
      <Badge variant="secondary">{count}</Badge>
    </div>
  );
}

function CourseCard({
  a,
}: {
  a: {
    id: string;
    course_id: string;
    priority: "mandatory" | "recommended";
    deadline: string | null;
    courses: { title: string; description: string | null; thumbnail_url: string | null } | null;
    stat: CourseStat;
    pct: number;
    overdue: boolean;
  };
}) {
  return (
    <Card className="flex flex-col overflow-hidden">
      {a.courses?.thumbnail_url ? (
        <div className="aspect-video w-full bg-muted">
          <img
            src={a.courses.thumbnail_url}
            alt={a.courses.title}
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
          <BookOpen className="h-10 w-10 text-primary/40" />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{a.courses?.title}</CardTitle>
          <Badge variant={a.priority === "mandatory" ? "default" : "secondary"}>
            {a.priority}
          </Badge>
        </div>
        {a.courses?.description ? (
          <CardDescription className="line-clamp-2">
            {a.courses.description}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="mt-auto space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {a.stat.done} / {a.stat.total} lessons
            </span>
            <span>{a.pct}%</span>
          </div>
          <Progress value={a.pct} />
        </div>
        {a.deadline && (
          <div
            className={`flex items-center gap-1.5 text-xs ${
              a.overdue ? "text-destructive" : "text-muted-foreground"
            }`}
          >
            {a.overdue ? (
              <AlertCircle className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            Due {format(new Date(a.deadline), "PP")}
          </div>
        )}
        <Button asChild size="sm" className="w-full">
          <Link to="/member/courses/$id" params={{ id: a.course_id }}>
            {a.pct === 0 ? "Start course" : a.pct === 100 ? "Review" : "Continue"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
