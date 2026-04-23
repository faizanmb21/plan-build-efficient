import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCcw, CheckCircle2, Award } from "lucide-react";

export const Route = createFileRoute("/member/grades")({
  component: GradesPage,
});

interface GradeRow {
  id: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  lesson_id: string;
  lesson_title: string;
  course_title: string;
  course_id: string | null;
}

interface ProjectGradeRow {
  id: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  project_id: string;
  project_title: string;
}

function GradesPage() {
  const { user } = useAuth();
  const [rows, setRows] = React.useState<GradeRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectGradeRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Lesson submissions
    const { data: subs } = await supabase
      .from("submissions")
      .select(
        "id,status,letter_grade,grade,feedback,created_at,reviewed_at,lesson_id",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
    const { data: lessons } = lessonIds.length
      ? await supabase
          .from("lessons")
          .select("id,title,section_id,sections(course_id,courses(title))")
          .in("id", lessonIds)
      : { data: [] as any[] };

    const lessonMap = new Map<
      string,
      { title: string; courseTitle: string; courseId: string | null }
    >();
    (lessons ?? []).forEach((l: any) => {
      lessonMap.set(l.id, {
        title: l.title,
        courseTitle: l.sections?.courses?.title ?? "Course",
        courseId: l.sections?.course_id ?? null,
      });
    });

    const enriched: GradeRow[] = (subs ?? []).map((s: any) => ({
      ...s,
      lesson_title: lessonMap.get(s.lesson_id)?.title ?? "Lesson",
      course_title: lessonMap.get(s.lesson_id)?.courseTitle ?? "Course",
      course_id: lessonMap.get(s.lesson_id)?.courseId ?? null,
    }));
    setRows(enriched);

    // Project submissions
    const { data: psubs } = await supabase
      .from("project_submissions")
      .select(
        "id,status,letter_grade,grade,feedback,created_at,reviewed_at,project_id",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    const projectIds = Array.from(
      new Set((psubs ?? []).map((s) => s.project_id)),
    );
    const { data: projects } = projectIds.length
      ? await supabase
          .from("projects")
          .select("id,title")
          .in("id", projectIds)
      : { data: [] as any[] };

    const projectMap = new Map<string, string>();
    (projects ?? []).forEach((p: any) => projectMap.set(p.id, p.title));

    const enrichedProjects: ProjectGradeRow[] = (psubs ?? []).map((s: any) => ({
      ...s,
      project_title: projectMap.get(s.project_id) ?? "Project",
    }));
    setProjectRows(enrichedProjects);

    setLoading(false);
  }, [user]);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My grades</h1>
          <p className="text-sm text-muted-foreground">
            Letter grades and feedback from your franchise incharge.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </header>

      <Tabs defaultValue="lessons">
        <TabsList>
          <TabsTrigger value="lessons">Lesson grades</TabsTrigger>
          <TabsTrigger value="projects">Project grades</TabsTrigger>
        </TabsList>

        <TabsContent value="lessons" className="space-y-6">
          <GradesSection
            rows={rows}
            loading={loading}
            emptyTitle="No submissions yet"
            emptyDescription="Submit a practical from any course to start earning grades."
            renderCard={(r) => <LessonGradeCard key={r.id} row={r} />}
          />
        </TabsContent>

        <TabsContent value="projects" className="space-y-6">
          <GradesSection
            rows={projectRows}
            loading={loading}
            emptyTitle="No project submissions yet"
            emptyDescription="Submit an assigned project to start earning grades."
            renderCard={(r) => <ProjectGradeCard key={r.id} row={r} />}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface AnyGradeRow {
  status: "pending" | "approved" | "revision";
  grade: number | null;
}

function GradesSection<T extends AnyGradeRow>({
  rows,
  loading,
  emptyTitle,
  emptyDescription,
  renderCard,
}: {
  rows: T[];
  loading: boolean;
  emptyTitle: string;
  emptyDescription: string;
  renderCard: (row: T) => React.ReactNode;
}) {
  const passed = rows.filter((r) => r.status === "approved");
  const redo = rows.filter((r) => r.status === "revision");
  const pending = rows.filter((r) => r.status === "pending");
  const avg =
    passed.length > 0
      ? Math.round(
          passed.reduce((s, r) => s + (r.grade ?? 0), 0) / passed.length,
        )
      : null;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryCard label="Passed" value={passed.length} icon={CheckCircle2} />
        <SummaryCard label="Redo" value={redo.length} />
        <SummaryCard label="Pending" value={pending.length} />
        <SummaryCard label="Avg %" value={avg ?? "—"} icon={Award} />
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading grades…
          </CardContent>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{emptyTitle}</CardTitle>
            <CardDescription>{emptyDescription}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">{rows.map((r) => renderCard(r))}</div>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadges({
  status,
  letter,
}: {
  status: "pending" | "approved" | "revision";
  letter: string | null;
}) {
  const isPass = status === "approved";
  const isRedo = status === "revision";
  const isPending = status === "pending";
  return (
    <div className="flex shrink-0 items-center gap-2">
      {letter && (
        <Badge
          variant="outline"
          className={`font-mono text-base ${
            isRedo ? "border-destructive text-destructive" : ""
          }`}
        >
          {letter}
        </Badge>
      )}
      {isPass && (
        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
          Passed
        </Badge>
      )}
      {isRedo && <Badge variant="destructive">Redo required</Badge>}
      {isPending && <Badge variant="secondary">Pending</Badge>}
    </div>
  );
}

function LessonGradeCard({ row }: { row: GradeRow }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.lesson_title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {row.course_title} ·{" "}
              {row.reviewed_at
                ? `Graded ${new Date(row.reviewed_at).toLocaleDateString()}`
                : `Submitted ${new Date(row.created_at).toLocaleDateString()}`}
            </p>
          </div>
          <StatusBadges status={row.status} letter={row.letter_grade} />
        </div>
        {row.feedback && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">{row.feedback}</p>
        )}
        {row.course_id && (
          <div className="flex justify-end">
            <Button asChild size="sm" variant="ghost">
              <Link to="/member/courses/$id" params={{ id: row.course_id }}>
                Open course
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectGradeCard({ row }: { row: ProjectGradeRow }) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{row.project_title}</p>
            <p className="truncate text-xs text-muted-foreground">
              Project ·{" "}
              {row.reviewed_at
                ? `Graded ${new Date(row.reviewed_at).toLocaleDateString()}`
                : `Submitted ${new Date(row.created_at).toLocaleDateString()}`}
            </p>
          </div>
          <StatusBadges status={row.status} letter={row.letter_grade} />
        </div>
        {row.feedback && (
          <p className="rounded-md bg-muted/50 p-2 text-sm">{row.feedback}</p>
        )}
        <div className="flex justify-end">
          <Button asChild size="sm" variant="ghost">
            <Link to="/member/projects">Open projects</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
