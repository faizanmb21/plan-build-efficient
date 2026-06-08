import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CheckCircle2, Clock, RefreshCcw, FileText, Loader2, FolderKanban } from "lucide-react";
import { LessonReviewDialog, type LessonSubmission } from "@/components/grading/LessonReviewDialog";
import { ProjectGradeDialog, type ProjectSubmission } from "@/components/grading/ProjectGradeDialog";
import { letterColorClass } from "@/lib/grade-utils";

export const Route = createFileRoute("/incharge/reviews")({
  component: ReviewsPage,
});

type SubmissionStatus = "pending" | "approved" | "revision";

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  pending: { label: "Pending", icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  approved: { label: "Approved", icon: CheckCircle2, cls: "bg-primary/15 text-primary" },
  revision: { label: "Revision", icon: RefreshCcw, cls: "bg-destructive/15 text-destructive" },
};

type ProjectSubRow = ProjectSubmission & {
  member_name: string;
  project_title: string;
};

function ReviewsPage() {
  const { user, profile } = useAuth();
  const [kind, setKind] = React.useState<"lesson" | "project">("lesson");
  const [statusTab, setStatusTab] = React.useState<SubmissionStatus | "all">("pending");

  const [lessonRows, setLessonRows] = React.useState<LessonSubmission[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectSubRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [activeLesson, setActiveLesson] = React.useState<LessonSubmission | null>(null);
  const [activeProject, setActiveProject] = React.useState<ProjectSubRow | null>(null);

  const load = React.useCallback(async () => {
    if (!profile?.franchise_id || !user) return;
    setLoading(true);

    const franchiseId = profile.franchise_id;

    // Resolve member IDs for this franchise so we can scope queries explicitly
    const { data: memberProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("franchise_id", franchiseId);
    const memberIds = (memberProfiles ?? []).map((p) => p.id);

    if (memberIds.length === 0) {
      setLessonRows([]);
      setProjectRows([]);
      setLoading(false);
      return;
    }

    // ----- Lesson practical submissions (scoped to franchise members) -----
    const { data: subs, error } = await supabase
      .from("submissions")
      .select("id,status,file_url,grade,letter_grade,feedback,created_at,reviewed_at,user_id,lesson_id")
      .in("user_id", memberIds)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
    const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)));

    // ----- Project submissions (scoped to franchise members) -----
    const { data: psubs } = await supabase
      .from("project_submissions")
      .select("id,project_id,user_id,file_url,status,letter_grade,grade,feedback,reviewed_at,created_at")
      .in("user_id", memberIds)
      .order("created_at", { ascending: false });

    const projIds = Array.from(new Set((psubs ?? []).map((s) => s.project_id)));
    const allUserIds = Array.from(new Set([...userIds, ...((psubs ?? []).map((s) => s.user_id))]));

    const [{ data: lessons }, { data: profiles }, { data: projects }] = await Promise.all([
      lessonIds.length
        ? supabase
            .from("lessons")
            .select("id,title,section_id,sections(course_id,courses(title))")
            .in("id", lessonIds)
        : Promise.resolve({ data: [] as any[] }),
      allUserIds.length
        ? supabase.from("profiles").select("id,full_name").in("id", allUserIds)
        : Promise.resolve({ data: [] as any[] }),
      projIds.length
        ? supabase.from("projects").select("id,title").in("id", projIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const lessonMap = new Map<string, { title: string; courseTitle: string }>();
    (lessons ?? []).forEach((l: any) => {
      lessonMap.set(l.id, {
        title: l.title,
        courseTitle: l.sections?.courses?.title ?? "Course",
      });
    });
    const profileMap = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      profileMap.set(p.id, p.full_name ?? "Member");
    });
    const projectMap = new Map<string, string>();
    (projects ?? []).forEach((p: any) => {
      projectMap.set(p.id, p.title ?? "Project");
    });

    const enrichedLessons: LessonSubmission[] = (subs ?? []).map((s: any) => ({
      ...s,
      status: s.status as SubmissionStatus,
      letter_grade: (s.letter_grade as string | null) ?? null,
      lesson_title: lessonMap.get(s.lesson_id)?.title ?? "Lesson",
      course_title: lessonMap.get(s.lesson_id)?.courseTitle ?? "Course",
      member_name: profileMap.get(s.user_id) ?? "Member",
    }));

    const enrichedProjects: ProjectSubRow[] = (psubs ?? []).map((s: any) => ({
      ...s,
      status: s.status as SubmissionStatus,
      member_name: profileMap.get(s.user_id) ?? "Member",
      project_title: projectMap.get(s.project_id) ?? "Project",
    }));

    setLessonRows(enrichedLessons);
    setProjectRows(enrichedProjects);
    setLoading(false);
  }, [profile?.franchise_id, user]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredLessons = React.useMemo(
    () => (statusTab === "all" ? lessonRows : lessonRows.filter((r) => r.status === statusTab)),
    [lessonRows, statusTab],
  );
  const filteredProjects = React.useMemo(
    () => (statusTab === "all" ? projectRows : projectRows.filter((r) => r.status === statusTab)),
    [projectRows, statusTab],
  );

  const counts = React.useMemo(() => {
    const src = kind === "lesson" ? lessonRows : projectRows;
    return {
      pending: src.filter((r) => r.status === "pending").length,
      approved: src.filter((r) => r.status === "approved").length,
      revision: src.filter((r) => r.status === "revision").length,
      all: src.length,
    };
  }, [kind, lessonRows, projectRows]);

  const totalPending = lessonRows.filter((r) => r.status === "pending").length +
    projectRows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Grade course practicals and standalone project submissions from members in your franchise.
            {totalPending > 0 && (
              <span className="ml-2 font-medium text-amber-600 dark:text-amber-300">
                {totalPending} pending review
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh
        </Button>
      </header>

      <Tabs value={kind} onValueChange={(v) => setKind(v as "lesson" | "project")}>
        <TabsList>
          <TabsTrigger value="lesson">
            Course practicals ({lessonRows.length})
          </TabsTrigger>
          <TabsTrigger value="project">
            Project submissions ({projectRows.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="revision">Revision ({counts.revision})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading submissions…
          </CardContent>
        </Card>
      ) : kind === "lesson" ? (
        filteredLessons.length === 0 ? (
          <EmptyCard kind="lesson" tab={statusTab} />
        ) : (
          <div className="grid gap-3">
            {filteredLessons.map((row) => (
              <LessonCard key={row.id} row={row} onOpen={() => setActiveLesson(row)} />
            ))}
          </div>
        )
      ) : filteredProjects.length === 0 ? (
        <EmptyCard kind="project" tab={statusTab} />
      ) : (
        <div className="grid gap-3">
          {filteredProjects.map((row) => (
            <ProjectCard key={row.id} row={row} onOpen={() => setActiveProject(row)} />
          ))}
        </div>
      )}

      <LessonReviewDialog
        row={activeLesson}
        reviewerId={user?.id ?? ""}
        onClose={() => setActiveLesson(null)}
        onSaved={() => {
          setActiveLesson(null);
          load();
        }}
      />

      <ProjectGradeDialog
        sub={activeProject}
        memberName={activeProject?.member_name ?? null}
        reviewerId={user?.id ?? ""}
        onClose={() => setActiveProject(null)}
        onSaved={() => {
          setActiveProject(null);
          load();
        }}
      />
    </div>
  );
}

function EmptyCard({ kind, tab }: { kind: "lesson" | "project"; tab: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nothing here</CardTitle>
        <CardDescription>
          {tab === "pending"
            ? `No ${kind === "lesson" ? "course practical" : "project"} submissions waiting for review. 🎉`
            : "No submissions match this filter."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function LessonCard({ row, onOpen }: { row: LessonSubmission; onOpen: () => void }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="truncate font-medium">{row.lesson_title}</p>
            <Badge variant="secondary" className={meta.cls}>
              <Icon className="mr-1 h-3 w-3" />
              {meta.label}
            </Badge>
            {row.letter_grade && (
              <Badge variant="outline" className={`font-mono ${letterColorClass(row.letter_grade)}`}>
                {row.letter_grade}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {row.member_name} · {row.course_title} · {new Date(row.created_at).toLocaleDateString()}
            {row.grade !== null && ` · ${row.grade}%`}
          </p>
        </div>
        <Button size="sm" onClick={onOpen}>
          {row.status === "pending" ? "Review" : "Open"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ row, onOpen }: { row: ProjectSubRow; onOpen: () => void }) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="flex items-center justify-between gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="truncate font-medium">{row.project_title}</p>
            <Badge variant="secondary" className={meta.cls}>
              <Icon className="mr-1 h-3 w-3" />
              {meta.label}
            </Badge>
            {row.letter_grade && (
              <Badge variant="outline" className={`font-mono ${letterColorClass(row.letter_grade)}`}>
                {row.letter_grade}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {row.member_name} · Project · {new Date(row.created_at).toLocaleDateString()}
            {row.grade !== null && ` · ${row.grade}%`}
          </p>
        </div>
        <Button size="sm" onClick={onOpen}>
          {row.status === "pending" ? "Review" : "Open"}
        </Button>
      </CardContent>
    </Card>
  );
}
