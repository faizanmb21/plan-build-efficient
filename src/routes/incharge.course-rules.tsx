import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { canEditCourseMandatory } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import {
  listCoursesForMandatoryEditor,
  setCourseLessonsRequireSubmission,
  setLessonRequiresSubmission,
} from "@/lib/course-mandatory.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, ChevronDown, ChevronRight, CheckCheck, X as XIcon, Video, FileText, HelpCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/incharge/course-rules")({
  component: CourseRulesPage,
});

type LessonType = "video" | "pdf" | "quiz" | "practical";

interface Lesson {
  id: string;
  section_id: string;
  title: string;
  type: LessonType;
  position: number;
  duration_seconds: number | null;
  requires_submission: boolean;
}
interface Section {
  id: string;
  course_id: string;
  title: string;
  position: number;
}
interface Course {
  id: string;
  title: string;
  status: "draft" | "published";
}

const ICONS: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  pdf: FileText,
  quiz: HelpCircle,
  practical: ClipboardCheck,
};

function fmtDuration(sec: number | null) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CourseRulesPage() {
  const { user, roles, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const listFn = useServerFn(listCoursesForMandatoryEditor);
  const setOneFn = useServerFn(setLessonRequiresSubmission);
  const setAllFn = useServerFn(setCourseLessonsRequireSubmission);

  const allowed = canEditCourseMandatory(user?.id, roles);

  const [loading, setLoading] = React.useState(true);
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [sections, setSections] = React.useState<Section[]>([]);
  const [lessons, setLessons] = React.useState<Lesson[]>([]);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [busyCourse, setBusyCourse] = React.useState<string | null>(null);
  const [busyLesson, setBusyLesson] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (authLoading) return;
    if (!allowed) {
      navigate({ to: "/incharge" });
    }
  }, [authLoading, allowed, navigate]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const res = await listFn({ data: { accessToken: sess.session?.access_token } });
    if (!res.ok) {
      toast.error(res.error);
      setLoading(false);
      return;
    }
    setCourses(res.courses as Course[]);
    setSections(res.sections as Section[]);
    setLessons(res.lessons as Lesson[]);
    setLoading(false);
  }, [listFn]);

  React.useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const lessonsByCourse = React.useMemo(() => {
    const secToCourse = new Map(sections.map((s) => [s.id, s.course_id]));
    const map = new Map<string, Lesson[]>();
    for (const l of lessons) {
      const cid = secToCourse.get(l.section_id);
      if (!cid) continue;
      const arr = map.get(cid) ?? [];
      arr.push(l);
      map.set(cid, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const sa = sections.find((s) => s.id === a.section_id);
        const sb = sections.find((s) => s.id === b.section_id);
        const pa = sa?.position ?? 0;
        const pb = sb?.position ?? 0;
        if (pa !== pb) return pa - pb;
        return a.position - b.position;
      });
    }
    return map;
  }, [sections, lessons]);

  async function toggleLesson(lesson: Lesson, value: boolean) {
    setBusyLesson(lesson.id);
    setLessons((prev) =>
      prev.map((l) => (l.id === lesson.id ? { ...l, requires_submission: value } : l)),
    );
    const { data: sess } = await supabase.auth.getSession();
    const res = await setOneFn({
      data: { lessonId: lesson.id, value, accessToken: sess.session?.access_token },
    });
    setBusyLesson(null);
    if (!res.ok) {
      setLessons((prev) =>
        prev.map((l) => (l.id === lesson.id ? { ...l, requires_submission: !value } : l)),
      );
      toast.error(res.error);
    }
  }

  async function bulkToggle(courseId: string, value: boolean) {
    setBusyCourse(courseId);
    const ids = new Set((lessonsByCourse.get(courseId) ?? []).map((l) => l.id));
    setLessons((prev) =>
      prev.map((l) => (ids.has(l.id) ? { ...l, requires_submission: value } : l)),
    );
    const { data: sess } = await supabase.auth.getSession();
    const res = await setAllFn({
      data: { courseId, value, accessToken: sess.session?.access_token },
    });
    setBusyCourse(null);
    if (!res.ok) {
      toast.error(res.error);
      load();
      return;
    }
    toast.success(value ? "Marked all mandatory" : "Cleared all mandatory");
  }

  if (authLoading || !allowed) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Course rules</h1>
        <p className="text-sm text-muted-foreground">
          Choose which lessons require a member submission before the next one unlocks.
        </p>
      </header>

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading courses…
          </CardContent>
        </Card>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No courses yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {courses.map((c) => {
            const ls = lessonsByCourse.get(c.id) ?? [];
            const total = ls.length;
            const mandatory = ls.filter((l) => l.requires_submission).length;
            const isOpen = !!expanded[c.id];
            const busy = busyCourse === c.id;
            return (
              <Card key={c.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((e) => ({ ...e, [c.id]: !e[c.id] }))
                      }
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <CardTitle className="truncate text-base">{c.title}</CardTitle>
                      <Badge variant={c.status === "published" ? "default" : "secondary"}>
                        {c.status}
                      </Badge>
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {mandatory} of {total} mandatory
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || total === 0}
                        onClick={() => bulkToggle(c.id, true)}
                      >
                        {busy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCheck className="h-3.5 w-3.5" />
                        )}
                        Mark all
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy || total === 0}
                        onClick={() => bulkToggle(c.id, false)}
                      >
                        <XIcon className="h-3.5 w-3.5" />
                        Clear all
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isOpen && (
                  <CardContent className="pt-0">
                    {total === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        This course has no lessons yet.
                      </p>
                    ) : (
                      <ul className="divide-y divide-white/5 rounded-md border border-white/10">
                        {ls.map((l) => {
                          const Icon = ICONS[l.type] ?? Video;
                          const lBusy = busyLesson === l.id;
                          return (
                            <li
                              key={l.id}
                              className="flex items-center gap-3 px-3 py-2 text-sm"
                            >
                              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate">{l.title}</span>
                              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                {fmtDuration(l.duration_seconds)}
                              </span>
                              <span className="flex shrink-0 items-center gap-2">
                                {lBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                                <span className="text-xs text-muted-foreground">
                                  Mandatory
                                </span>
                                <Switch
                                  checked={l.requires_submission}
                                  disabled={lBusy}
                                  onCheckedChange={(v) => toggleLesson(l, v)}
                                  aria-label="Toggle mandatory submission"
                                />
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
