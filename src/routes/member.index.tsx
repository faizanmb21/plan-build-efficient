import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { BookOpen, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/member/")({
  component: MemberHome,
});

type AssignmentRow = {
  id: string;
  course_id: string;
  priority: "mandatory" | "recommended";
  deadline: string | null;
  courses: { id: string; title: string; description: string | null; thumbnail_url: string | null } | null;
};

type CourseStat = {
  total: number;
  done: number;
};

function MemberHome() {
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [assignments, setAssignments] = React.useState<AssignmentRow[]>([]);
  const [stats, setStats] = React.useState<Record<string, CourseStat>>({});

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
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
      // Dedupe by course_id (a member could be assigned individually + via franchise)
      const seen = new Set<string>();
      const unique: AssignmentRow[] = [];
      for (const a of (aData ?? []) as AssignmentRow[]) {
        if (a.courses && !seen.has(a.course_id)) {
          seen.add(a.course_id);
          unique.push(a);
        }
      }
      setAssignments(unique);

      // Lesson totals + completed counts per course
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
              .select("lesson_id,completed")
              .eq("user_id", user.id)
              .in("lesson_id", lessonIds)
          : { data: [] as { lesson_id: string; completed: boolean }[] };
        const dones: Record<string, number> = {};
        for (const p of prog ?? []) {
          if (!p.completed) continue;
          const cid = lessonToCourse.get(p.lesson_id);
          if (cid) dones[cid] = (dones[cid] ?? 0) + 1;
        }
        const map: Record<string, CourseStat> = {};
        for (const cid of courseIds) {
          map[cid] = { total: totals[cid] ?? 0, done: dones[cid] ?? 0 };
        }
        setStats(map);
      } else {
        setStats({});
      }
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">My Courses</h1>
        <p className="text-sm text-muted-foreground">Your assigned learning.</p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : assignments.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No courses assigned yet</CardTitle>
            <CardDescription>
              Once your CEO assigns a course to you or your franchise, it will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {assignments.map((a) => {
            const s = stats[a.course_id] ?? { total: 0, done: 0 };
            const pct = s.total ? Math.round((s.done / s.total) * 100) : 0;
            const overdue = a.deadline && new Date(a.deadline) < new Date() && pct < 100;
            return (
              <Card key={a.id} className="overflow-hidden flex flex-col">
                {a.courses?.thumbnail_url ? (
                  <div className="aspect-video w-full bg-muted">
                    <img
                      src={a.courses.thumbnail_url}
                      alt={a.courses.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-video w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
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
                        {s.done} / {s.total} lessons
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                  {a.deadline && (
                    <div
                      className={`flex items-center gap-1.5 text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                    >
                      {overdue ? <AlertCircle className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      Due {format(new Date(a.deadline), "PP")}
                    </div>
                  )}
                  <Button asChild size="sm" className="w-full">
                    <Link to="/member/courses/$id" params={{ id: a.course_id }}>
                      {pct === 0 ? "Start course" : pct === 100 ? "Review" : "Continue"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
