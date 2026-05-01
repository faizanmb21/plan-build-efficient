import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Clock, RefreshCcw, FileText, Loader2, FolderKanban } from "lucide-react";
import { LessonReviewDialog, type LessonSubmission } from "@/components/grading/LessonReviewDialog";
import { ProjectGradeDialog, type ProjectSubmission } from "@/components/grading/ProjectGradeDialog";
import { letterColorClass } from "@/lib/grade-utils";

export const Route = createFileRoute("/qa/submissions")({
  component: QaSubmissionsPage,
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

type LessonRow = LessonSubmission & { franchise_id: string | null; franchise_name: string };
type ProjectRow = ProjectSubmission & {
  member_name: string;
  project_title: string;
  franchise_id: string | null;
  franchise_name: string;
};

function QaSubmissionsPage() {
  const { user } = useAuth();
  const [kind, setKind] = React.useState<"lesson" | "project">("lesson");
  const [statusTab, setStatusTab] = React.useState<SubmissionStatus | "all">("pending");
  const [franchiseFilter, setFranchiseFilter] = React.useState<string>("all");

  const [lessonRows, setLessonRows] = React.useState<LessonRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectRow[]>([]);
  const [franchises, setFranchises] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);

  const [activeLesson, setActiveLesson] = React.useState<LessonRow | null>(null);
  const [activeProject, setActiveProject] = React.useState<ProjectRow | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);

    const [{ data: subs, error: sErr }, { data: psubs }] = await Promise.all([
      supabase
        .from("submissions")
        .select("id,status,file_url,grade,letter_grade,feedback,created_at,reviewed_at,user_id,lesson_id")
        .order("created_at", { ascending: false }),
      supabase
        .from("project_submissions")
        .select("id,project_id,user_id,file_url,status,letter_grade,grade,feedback,reviewed_at,created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (sErr) {
      toast.error(sErr.message);
      setLoading(false);
      return;
    }

    const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
    const projIds = Array.from(new Set((psubs ?? []).map((s) => s.project_id)));
    const userIds = Array.from(
      new Set([...(subs ?? []).map((s) => s.user_id), ...(psubs ?? []).map((s) => s.user_id)]),
    );

    const [{ data: lessons }, { data: projects }, { data: profiles }, { data: fRows }] =
      await Promise.all([
        lessonIds.length
          ? supabase
              .from("lessons")
              .select("id,title,section_id,sections(course_id,courses(title))")
              .in("id", lessonIds)
          : Promise.resolve({ data: [] as any[] }),
        projIds.length
          ? supabase.from("projects").select("id,title").in("id", projIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length
          ? supabase.from("profiles").select("id,full_name,franchise_id").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("franchises").select("id,name").is("archived_at", null).order("name"),
      ]);

    const lessonMap = new Map<string, { title: string; courseTitle: string }>();
    (lessons ?? []).forEach((l: any) => {
      lessonMap.set(l.id, {
        title: l.title,
        courseTitle: l.sections?.courses?.title ?? "Course",
      });
    });
    const projectMap = new Map<string, string>();
    (projects ?? []).forEach((p: any) => projectMap.set(p.id, p.title ?? "Project"));
    const profileMap = new Map<string, { name: string; franchise_id: string | null }>();
    (profiles ?? []).forEach((p: any) =>
      profileMap.set(p.id, { name: p.full_name ?? "Member", franchise_id: p.franchise_id ?? null }),
    );
    const franchiseMap = new Map<string, string>();
    (fRows ?? []).forEach((f: any) => franchiseMap.set(f.id, f.name));

    setFranchises((fRows ?? []) as { id: string; name: string }[]);

    setLessonRows(
      (subs ?? []).map((s: any) => {
        const profile = profileMap.get(s.user_id);
        const franchise_id = profile?.franchise_id ?? null;
        return {
          ...s,
          status: s.status as SubmissionStatus,
          letter_grade: (s.letter_grade as string | null) ?? null,
          lesson_title: lessonMap.get(s.lesson_id)?.title ?? "Lesson",
          course_title: lessonMap.get(s.lesson_id)?.courseTitle ?? "Course",
          member_name: profile?.name ?? "Member",
          franchise_id,
          franchise_name: franchise_id ? franchiseMap.get(franchise_id) ?? "—" : "—",
        } as LessonRow;
      }),
    );

    setProjectRows(
      (psubs ?? []).map((s: any) => {
        const profile = profileMap.get(s.user_id);
        const franchise_id = profile?.franchise_id ?? null;
        return {
          ...s,
          status: s.status as SubmissionStatus,
          member_name: profile?.name ?? "Member",
          project_title: projectMap.get(s.project_id) ?? "Project",
          franchise_id,
          franchise_name: franchise_id ? franchiseMap.get(franchise_id) ?? "—" : "—",
        } as ProjectRow;
      }),
    );

    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filteredLessons = React.useMemo(
    () =>
      lessonRows.filter(
        (r) =>
          (statusTab === "all" || r.status === statusTab) &&
          (franchiseFilter === "all" || r.franchise_id === franchiseFilter),
      ),
    [lessonRows, statusTab, franchiseFilter],
  );

  const filteredProjects = React.useMemo(
    () =>
      projectRows.filter(
        (r) =>
          (statusTab === "all" || r.status === statusTab) &&
          (franchiseFilter === "all" || r.franchise_id === franchiseFilter),
      ),
    [projectRows, statusTab, franchiseFilter],
  );

  const counts = React.useMemo(() => {
    const src = (kind === "lesson" ? lessonRows : projectRows).filter(
      (r) => franchiseFilter === "all" || r.franchise_id === franchiseFilter,
    );
    return {
      pending: src.filter((r) => r.status === "pending").length,
      approved: src.filter((r) => r.status === "approved").length,
      revision: src.filter((r) => r.status === "revision").length,
      all: src.length,
    };
  }, [kind, lessonRows, projectRows, franchiseFilter]);

  const totalPending =
    lessonRows.filter((r) => r.status === "pending").length +
    projectRows.filter((r) => r.status === "pending").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
          <p className="text-sm text-muted-foreground">
            Grade course practicals and project submissions across all franchises.
            {totalPending > 0 && (
              <span className="ml-2 font-medium text-amber-600 dark:text-amber-300">
                {totalPending} pending
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={franchiseFilter} onValueChange={setFranchiseFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter franchise" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All franchises</SelectItem>
              {franchises.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </header>

      <Tabs value={kind} onValueChange={(v) => setKind(v as "lesson" | "project")}>
        <TabsList>
          <TabsTrigger value="lesson">Course practicals ({lessonRows.length})</TabsTrigger>
          <TabsTrigger value="project">Project submissions ({projectRows.length})</TabsTrigger>
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
            ? `No ${kind === "lesson" ? "course practical" : "project"} submissions waiting for review.`
            : "No submissions match this filter."}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function LessonCard({ row, onOpen }: { row: LessonRow; onOpen: () => void }) {
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
            {row.member_name} · {row.franchise_name} · {row.course_title} ·{" "}
            {new Date(row.created_at).toLocaleDateString()}
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

function ProjectCard({ row, onOpen }: { row: ProjectRow; onOpen: () => void }) {
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
            {row.member_name} · {row.franchise_name} · {new Date(row.created_at).toLocaleDateString()}
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
