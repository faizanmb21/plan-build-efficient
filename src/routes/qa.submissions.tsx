import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileCheck,
  FileText,
  FolderKanban,
  Inbox,
  Loader2,
  RefreshCcw,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  LessonReviewPanel,
  type LessonSubmission,
} from "@/components/grading/LessonReviewPanel";
import {
  ProjectReviewPanel,
  type ProjectSubmission,
} from "@/components/grading/ProjectReviewPanel";
import { letterColorClass } from "@/lib/grade-utils";
import { MiniAvatar } from "@/components/dashboard/ProgressPrimitives";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/qa/submissions")({
  component: QaSubmissionsPage,
});

type SubmissionStatus = "pending" | "approved" | "revision";

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  pending: {
    label: "Pending",
    icon: Clock,
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  approved: {
    label: "Approved",
    icon: CheckCircle2,
    cls: "bg-primary/15 text-primary",
  },
  revision: {
    label: "Revision",
    icon: RefreshCcw,
    cls: "bg-destructive/15 text-destructive",
  },
};

type LessonRow = LessonSubmission & {
  franchise_id: string | null;
  franchise_name: string;
};
type ProjectRow = ProjectSubmission & {
  member_name: string;
  project_title: string;
  franchise_id: string | null;
  franchise_name: string;
};

type Kind = "lesson" | "project";
type StatusTab = SubmissionStatus | "all";

function QaSubmissionsPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [kind, setKind] = React.useState<Kind>("lesson");
  const [statusTab, setStatusTab] = React.useState<StatusTab>("pending");
  const [franchiseFilter, setFranchiseFilter] = React.useState<string>("all");

  const [lessonRows, setLessonRows] = React.useState<LessonRow[]>([]);
  const [projectRows, setProjectRows] = React.useState<ProjectRow[]>([]);
  const [franchises, setFranchises] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [loading, setLoading] = React.useState(true);

  const [selectedLessonId, setSelectedLessonId] = React.useState<string | null>(
    null,
  );
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(
    null,
  );

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Resolve QA's assigned franchises first, then scope all queries to those members
    const { data: assignments } = await supabase
      .from("qa_franchise_assignments")
      .select("franchise_id")
      .eq("user_id", user.id);
    const franchiseIds = (assignments ?? []).map((r) => r.franchise_id);

    if (franchiseIds.length === 0) {
      setLessonRows([]);
      setProjectRows([]);
      setFranchises([]);
      setLoading(false);
      return;
    }

    // Get member IDs for assigned franchises
    const { data: memberProfiles } = await supabase
      .from("profiles")
      .select("id")
      .in("franchise_id", franchiseIds);
    const memberIds = (memberProfiles ?? []).map((p) => p.id);

    const [{ data: subs, error: sErr }, { data: psubs }] = await Promise.all([
      memberIds.length
        ? supabase
            .from("submissions")
            .select(
              "id,status,file_url,grade,letter_grade,feedback,created_at,reviewed_at,user_id,lesson_id",
            )
            .in("user_id", memberIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[], error: null }),
      memberIds.length
        ? supabase
            .from("project_submissions")
            .select(
              "id,project_id,user_id,file_url,status,letter_grade,grade,feedback,reviewed_at,created_at",
            )
            .in("user_id", memberIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
    ]);

    if (sErr) {
      toast.error(sErr.message);
      setLoading(false);
      return;
    }

    const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
    const projIds = Array.from(new Set((psubs ?? []).map((s) => s.project_id)));
    const userIds = Array.from(
      new Set([
        ...(subs ?? []).map((s) => s.user_id),
        ...(psubs ?? []).map((s) => s.user_id),
      ]),
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
          ? supabase
              .from("profiles")
              .select("id,full_name,franchise_id")
              .in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("franchises")
          .select("id,name")
          .in("id", franchiseIds)
          .is("archived_at", null)
          .order("name"),
      ]);

    const lessonMap = new Map<string, { title: string; courseTitle: string }>();
    (lessons ?? []).forEach((l: any) => {
      lessonMap.set(l.id, {
        title: l.title,
        courseTitle: l.sections?.courses?.title ?? "Course",
      });
    });
    const projectMap = new Map<string, string>();
    (projects ?? []).forEach((p: any) =>
      projectMap.set(p.id, p.title ?? "Project"),
    );
    const profileMap = new Map<
      string,
      { name: string; franchise_id: string | null }
    >();
    (profiles ?? []).forEach((p: any) =>
      profileMap.set(p.id, {
        name: p.full_name ?? "Member",
        franchise_id: p.franchise_id ?? null,
      }),
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
          franchise_name: franchise_id
            ? franchiseMap.get(franchise_id) ?? "—"
            : "—",
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
          franchise_name: franchise_id
            ? franchiseMap.get(franchise_id) ?? "—"
            : "—",
        } as ProjectRow;
      }),
    );

    setLoading(false);
  }, [user]);

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

  // Keep selected ID valid as filters change
  const selectedLesson = React.useMemo(
    () => filteredLessons.find((r) => r.id === selectedLessonId) ?? null,
    [filteredLessons, selectedLessonId],
  );
  const selectedProject = React.useMemo(
    () => filteredProjects.find((r) => r.id === selectedProjectId) ?? null,
    [filteredProjects, selectedProjectId],
  );

  // Auto-select first item on desktop when filter changes and nothing valid is selected
  React.useEffect(() => {
    if (isMobile) return;
    if (kind === "lesson" && !selectedLesson && filteredLessons[0]) {
      setSelectedLessonId(filteredLessons[0].id);
    } else if (kind === "project" && !selectedProject && filteredProjects[0]) {
      setSelectedProjectId(filteredProjects[0].id);
    }
  }, [kind, isMobile, filteredLessons, filteredProjects, selectedLesson, selectedProject]);

  const onSaved = React.useCallback(() => {
    load();
  }, [load]);

  const StatusChips = (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      {(["pending", "revision", "approved", "all"] as StatusTab[]).map((s) => {
        const label =
          s === "all"
            ? `All (${counts.all})`
            : `${STATUS_META[s].label} (${counts[s]})`;
        const active = statusTab === s;
        return (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const KindChips = (
    <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      {(
        [
          { k: "lesson" as const, label: "Course practicals", icon: FileText, count: lessonRows.length },
          { k: "project" as const, label: "Projects", icon: FolderKanban, count: projectRows.length },
        ]
      ).map(({ k, label, icon: Icon, count }) => {
        const active = kind === k;
        return (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label} ({count})
          </button>
        );
      })}
    </div>
  );

  const queueRows: QueueRow[] =
    kind === "lesson"
      ? filteredLessons.map((r) => ({
          id: r.id,
          title: r.lesson_title,
          subtitle: `${r.member_name} · ${r.franchise_name}`,
          memberName: r.member_name,
          status: r.status,
          letterGrade: r.letter_grade,
          createdAt: r.created_at,
        }))
      : filteredProjects.map((r) => ({
          id: r.id,
          title: r.project_title,
          subtitle: `${r.member_name} · ${r.franchise_name}`,
          memberName: r.member_name,
          status: r.status,
          letterGrade: r.letter_grade,
          createdAt: r.created_at,
        }));

  const selectedId = kind === "lesson" ? selectedLessonId : selectedProjectId;
  const onSelect = (id: string) => {
    if (kind === "lesson") setSelectedLessonId(id);
    else setSelectedProjectId(id);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Submission queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and grade submissions from your assigned franchises.
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
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {KindChips}
        {StatusChips}
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* Queue list */}
        <Card className="overflow-hidden p-0">
          <CardHeader className="border-b border-white/5 px-4 py-3">
            <CardTitle className="text-sm font-semibold">
              {queueRows.length} {queueRows.length === 1 ? "submission" : "submissions"}
            </CardTitle>
            <CardDescription className="text-xs">
              {STATUS_META[statusTab === "all" ? "pending" : statusTab]?.label ??
                "All"}{" "}
              · {kind === "lesson" ? "course practicals" : "projects"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : queueRows.length === 0 ? (
              <EmptyQueue />
            ) : (
              <ul className="max-h-[70vh] divide-y divide-white/5 overflow-y-auto">
                {queueRows.map((r) => (
                  <QueueItem
                    key={r.id}
                    row={r}
                    active={selectedId === r.id}
                    onClick={() => onSelect(r.id)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Review pane — desktop only */}
        {!isMobile && (
          <Card className="min-h-[60vh] p-0">
            <CardContent className="p-5">
              {kind === "lesson" && selectedLesson ? (
                <LessonReviewPanel
                  key={selectedLesson.id}
                  row={selectedLesson}
                  reviewerId={user?.id ?? ""}
                  onSaved={onSaved}
                />
              ) : kind === "project" && selectedProject ? (
                <ProjectReviewPanel
                  key={selectedProject.id}
                  sub={selectedProject}
                  memberName={selectedProject.member_name}
                  projectTitle={selectedProject.project_title}
                  reviewerId={user?.id ?? ""}
                  onSaved={onSaved}
                />
              ) : (
                <EmptyPane />
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile review sheet */}
      {isMobile && (
        <Sheet
          open={
            kind === "lesson" ? !!selectedLesson : !!selectedProject
          }
          onOpenChange={(o) => {
            if (!o) {
              setSelectedLessonId(null);
              setSelectedProjectId(null);
            }
          }}
        >
          <SheetContent side="bottom" className="h-[92vh] overflow-y-auto">
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedLessonId(null);
                    setSelectedProjectId(null);
                  }}
                  className="rounded-md p-1 hover:bg-white/5"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                Review submission
              </SheetTitle>
            </SheetHeader>
            <div className="pt-4">
              {kind === "lesson" && selectedLesson ? (
                <LessonReviewPanel
                  key={selectedLesson.id}
                  row={selectedLesson}
                  reviewerId={user?.id ?? ""}
                  onSaved={onSaved}
                />
              ) : kind === "project" && selectedProject ? (
                <ProjectReviewPanel
                  key={selectedProject.id}
                  sub={selectedProject}
                  memberName={selectedProject.member_name}
                  projectTitle={selectedProject.project_title}
                  reviewerId={user?.id ?? ""}
                  onSaved={onSaved}
                />
              ) : null}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

interface QueueRow {
  id: string;
  title: string;
  subtitle: string;
  memberName: string;
  status: SubmissionStatus;
  letterGrade: string | null;
  createdAt: string;
}

function QueueItem({
  row,
  active,
  onClick,
}: {
  row: QueueRow;
  active: boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[row.status];
  const Icon = meta.icon;
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
          active
            ? "bg-primary/10"
            : "hover:bg-white/[0.03]",
        )}
      >
        <MiniAvatar
          name={row.memberName}
          tone={
            row.status === "pending"
              ? "amber"
              : row.status === "revision"
                ? "rose"
                : "emerald"
          }
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium">{row.title}</p>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {row.subtitle}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className={cn("h-5 px-1.5 text-[10px]", meta.cls)}
            >
              <Icon className="mr-1 h-2.5 w-2.5" />
              {meta.label}
            </Badge>
            {row.letterGrade && (
              <Badge
                variant="outline"
                className={cn(
                  "h-5 px-1.5 font-mono text-[10px]",
                  letterColorClass(row.letterGrade),
                )}
              >
                {row.letterGrade}
              </Badge>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground">
              {new Date(row.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <Inbox className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Nothing here</p>
      <p className="text-xs text-muted-foreground">
        No submissions match the current filter.
      </p>
    </div>
  );
}

function EmptyPane() {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <FileCheck className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium">Pick a submission</p>
      <p className="max-w-xs text-xs text-muted-foreground">
        Select a row from the queue to preview the file and grade it without
        leaving this screen.
      </p>
    </div>
  );
}
