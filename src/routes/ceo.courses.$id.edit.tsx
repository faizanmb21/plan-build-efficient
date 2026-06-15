import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { parseVideoUrl, getYouTubeThumbnail } from "@/lib/video-embed";
import { fetchVideoMetadata } from "@/lib/video-metadata";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchYoutubePlaylist,
  formatDuration,
  type PlaylistVideo,
} from "@/lib/youtube-playlist";
import {
  ListVideo,
  Loader2,
  GripVertical,
  ArrowLeft,
  ChevronDown,
  Plus,
  Trash2,
  Upload,
  Video,
  FileText,
  HelpCircle,
  ClipboardCheck,
  Save,
  MoreVertical,
  Check,
  Pencil,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";
import { downscaleImage } from "@/lib/image-downscale";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirm } from "@/components/ui/confirm-dialog";

export const Route = createFileRoute("/ceo/courses/$id/edit")({
  component: CourseEditor,
});

type LessonType = "video" | "pdf" | "quiz" | "practical";

interface Section {
  id: string;
  title: string;
  position: number;
  lessons: Lesson[];
}
interface Lesson {
  id: string;
  section_id: string;
  title: string;
  type: LessonType;
  position: number;
  duration_seconds: number | null;
  content: any;
  requires_submission: boolean;
}

const LESSON_ICONS: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  pdf: FileText,
  quiz: HelpCircle,
  practical: ClipboardCheck,
};

const LESSON_TYPE_LABEL: Record<LessonType, string> = {
  video: "Video",
  pdf: "PDF",
  quiz: "Quiz",
  practical: "Practical",
};

const LESSON_TYPE_CHIP: Record<LessonType, string> = {
  video: "bg-accent/15 text-accent border-accent/30",
  pdf: "bg-primary/15 text-primary border-primary/30",
  quiz: "bg-secondary/40 text-secondary-foreground border-border",
  practical: "bg-destructive/10 text-destructive border-destructive/30",
};

function formatLessonDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

function CourseEditor() {
  const { id: courseId } = Route.useParams();
  const confirm = useConfirm();
  const [loading, setLoading] = React.useState(true);
  const [course, setCourse] = React.useState<{
    title: string;
    description: string | null;
    status: "draft" | "published";
    thumbnail_url: string | null;
  } | null>(null);
  const [sections, setSections] = React.useState<Section[]>([]);
  const [savingMeta, setSavingMeta] = React.useState(false);
  const [sectionDialogOpen, setSectionDialogOpen] = React.useState(false);
  const [newSectionTitle, setNewSectionTitle] = React.useState("");

  // Baseline (last persisted) meta values for dirty-state tracking.
  const [metaBaseline, setMetaBaseline] = React.useState<{
    title: string;
    description: string | null;
  } | null>(null);
  const [metaSavedFlash, setMetaSavedFlash] = React.useState(false);
  const [statusSavedFlash, setStatusSavedFlash] = React.useState(false);

  // Track in-flight curriculum mutations for the "Saving…" / "Saved" indicator.
  const [mutationCount, setMutationCount] = React.useState(0);
  const [curriculumSavedFlash, setCurriculumSavedFlash] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const beginMutation = React.useCallback(() => setMutationCount((n) => n + 1), []);
  const endMutation = React.useCallback((ok = true) => {
    setMutationCount((n) => Math.max(0, n - 1));
    if (ok) {
      setCurriculumSavedFlash(true);
      setLastSavedAt(new Date());
    }
  }, []);
  React.useEffect(() => {
    if (!curriculumSavedFlash) return;
    const t = setTimeout(() => setCurriculumSavedFlash(false), 2500);
    return () => clearTimeout(t);
  }, [curriculumSavedFlash]);

  const metaDirty =
    !!course &&
    !!metaBaseline &&
    ((course.title ?? "") !== metaBaseline.title ||
      (course.description ?? "") !== (metaBaseline.description ?? ""));

  React.useEffect(() => {
    if (!metaDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [metaDirty]);

  async function load() {
    setLoading(true);
    const [{ data: c, error: cErr }, { data: secs, error: sErr }, { data: lessons, error: lErr }] =
      await Promise.all([
        supabase
          .from("courses")
          .select("title,description,status,thumbnail_url")
          .eq("id", courseId)
          .single(),
        supabase
          .from("sections")
          .select("id,title,position")
          .eq("course_id", courseId)
          .order("position"),
        supabase
          .from("lessons")
          .select("id,section_id,title,type,position,duration_seconds,content,requires_submission")
          .order("position"),
      ]);
    if (cErr || sErr || lErr) {
      toast.error((cErr || sErr || lErr)!.message);
      setLoading(false);
      return;
    }
    setCourse(c);
    setMetaBaseline({ title: c.title, description: c.description });
    const lessonsBySection = new Map<string, Lesson[]>();
    for (const l of lessons ?? []) {
      const arr = lessonsBySection.get(l.section_id) ?? [];
      arr.push(l as Lesson);
      lessonsBySection.set(l.section_id, arr);
    }
    setSections(
      (secs ?? []).map((s) => ({
        ...s,
        lessons: (lessonsBySection.get(s.id) ?? []).sort((a, b) => a.position - b.position),
      })),
    );
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, [courseId]);

  async function saveMeta() {
    if (!course) return;
    setSavingMeta(true);
    const { error } = await supabase
      .from("courses")
      .update({
        title: course.title,
        description: course.description,
        thumbnail_url: course.thumbnail_url,
      })
      .eq("id", courseId);
    setSavingMeta(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMetaBaseline({ title: course.title, description: course.description });
    setMetaSavedFlash(true);
    setTimeout(() => setMetaSavedFlash(false), 2000);
    toast.success("Course details saved");
  }

  async function toggleStatus(next: "draft" | "published") {
    if (!course) return;
    const prev = course.status;
    setCourse({ ...course, status: next });
    const { error } = await supabase
      .from("courses")
      .update({ status: next })
      .eq("id", courseId);
    if (error) {
      setCourse((c) => (c ? { ...c, status: prev } : c));
      toast.error(error.message);
    } else {
      setStatusSavedFlash(true);
      setTimeout(() => setStatusSavedFlash(false), 2000);
      toast.success(next === "published" ? "Course published" : "Course set to draft");
    }
  }

  async function uploadThumbnail(original: File) {
    // Validate type + size up front (Udemy-style standards)
    if (!original.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG, or WebP).");
      return;
    }
    const MAX_BYTES = 10 * 1024 * 1024;
    if (original.size > MAX_BYTES) {
      toast.error("Image must be 10MB or smaller.");
      return;
    }
    // Always downscale before upload — keeps the site light.
    const file = await downscaleImage(original, { maxDimension: 1600, quality: 0.82 });
    const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
    const path = `${courseId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("thumbnails").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
    const url = `${data.publicUrl}?v=${Date.now()}`;
    // Persist immediately — no need to click Save details
    const { error: dbErr } = await supabase
      .from("courses")
      .update({ thumbnail_url: url })
      .eq("id", courseId);
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }
    setCourse((c) => (c ? { ...c, thumbnail_url: url } : c));
    toast.success("Thumbnail updated");
  }

  // Auto-set the course thumbnail from a YouTube video/playlist thumbnail URL.
  // `force=true` (used by playlist import) overwrites any existing thumbnail;
  // otherwise we respect a manually-set image.
  async function maybeAutoSetThumbnail(
    thumbnailUrl: string | null | undefined,
    opts: { force?: boolean } = {},
  ) {
    if (!thumbnailUrl) return;
    if (!course) return;
    if (!opts.force && course.thumbnail_url) return;
    const { error } = await supabase
      .from("courses")
      .update({ thumbnail_url: thumbnailUrl })
      .eq("id", courseId);
    if (error) return;
    setCourse((c) => (c ? { ...c, thumbnail_url: thumbnailUrl } : c));
    toast.success("Course thumbnail set from video");
  }

  async function addSectionWithTitle(rawTitle: string) {
    const title = rawTitle.trim();
    if (!title) return;
    const position = sections.length;
    beginMutation();
    const { data, error } = await supabase
      .from("sections")
      .insert({ course_id: courseId, title, position })
      .select("id,title,position")
      .single();
    endMutation();
    if (error) {
      toast.error(error.message);
      return;
    }
    setSections((s) => [...s, { ...data, lessons: [] }]);
    setNewSectionTitle("");
    setSectionDialogOpen(false);
  }

  async function renameSection(id: string, title: string) {
    beginMutation();
    const { error } = await supabase.from("sections").update({ title }).eq("id", id);
    endMutation();
    if (error) toast.error(error.message);
    else setSections((s) => s.map((sec) => (sec.id === id ? { ...sec, title } : sec)));
  }

  async function deleteSection(id: string) {
    const ok = await confirm({
      title: "Delete section?",
      description: "This will remove the section and all its lessons.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    beginMutation();
    const { error } = await supabase.from("sections").delete().eq("id", id);
    endMutation();
    if (error) toast.error(error.message);
    else setSections((s) => s.filter((sec) => sec.id !== id));
  }

  async function persistSectionOrder(next: Section[]) {
    const prevPosById = new Map(sections.map((s) => [s.id, s.position]));
    const updates = next
      .map((s, i) => ({ id: s.id, position: i }))
      .filter((u) => prevPosById.get(u.id) !== u.position);
    setSections(next.map((s, i) => ({ ...s, position: i })));
    if (updates.length === 0) return;
    beginMutation();
    await Promise.all(
      updates.map((u) => supabase.from("sections").update({ position: u.position }).eq("id", u.id)),
    );
    endMutation();
  }

  async function persistLessonChanges(next: Section[], affected: Set<string>) {
    const prevLessonsById = new Map<string, Lesson>();
    for (const sec of sections) for (const l of sec.lessons) prevLessonsById.set(l.id, l);
    const updates: { id: string; position: number; section_id: string }[] = [];
    for (const sec of next) {
      if (!affected.has(sec.id)) continue;
      sec.lessons.forEach((l, i) => {
        const prev = prevLessonsById.get(l.id);
        if (!prev || prev.position !== i || prev.section_id !== sec.id) {
          updates.push({ id: l.id, position: i, section_id: sec.id });
        }
      });
    }
    setSections(
      next.map((sec) => ({
        ...sec,
        lessons: sec.lessons.map((l, i) => ({ ...l, position: i, section_id: sec.id })),
      })),
    );
    if (updates.length === 0) return;
    beginMutation();
    await Promise.all(
      updates.map((u) =>
        supabase
          .from("lessons")
          .update({ position: u.position, section_id: u.section_id })
          .eq("id", u.id),
      ),
    );
    endMutation();
  }

  async function addLesson(
    sectionId: string,
    type: LessonType,
    title: string,
    content?: any,
    duration_seconds?: number | null,
  ) {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const position = sec.lessons.length;
    const defaultContent: Record<LessonType, any> = {
      video: { url: "" },
      pdf: { url: "" },
      quiz: { questions: [], passing_score: 70, max_attempts: 3 },
      practical: { brief: "" },
    };
    beginMutation();
    const { data, error } = await supabase
      .from("lessons")
      .insert({
        section_id: sectionId,
        title,
        type,
        position,
        duration_seconds: duration_seconds ?? null,
        content: (content ?? defaultContent[type]) as Json,
      })
      .select("id,section_id,title,type,position,duration_seconds,content,requires_submission")
      .single();
    endMutation();
    if (error) {
      toast.error(error.message);
      return;
    }
    setSections((s) =>
      s.map((sec) =>
        sec.id === sectionId ? { ...sec, lessons: [...sec.lessons, data as Lesson] } : sec,
      ),
    );
  }

  async function updateLesson(lesson: Lesson) {
    beginMutation();
    const { error } = await supabase
      .from("lessons")
      .update({
        title: lesson.title,
        content: lesson.content,
        duration_seconds: lesson.duration_seconds,
        requires_submission: lesson.requires_submission,
      })
      .eq("id", lesson.id);
    endMutation();
    if (error) toast.error(error.message);
    else {
      setSections((s) =>
        s.map((sec) =>
          sec.id === lesson.section_id
            ? {
                ...sec,
                lessons: sec.lessons.map((l) => (l.id === lesson.id ? lesson : l)),
              }
            : sec,
        ),
      );
      toast.success("Lesson saved");
    }
  }

  async function setLessonRequiresSubmission(lesson: Lesson, value: boolean) {
    // Optimistic UI update — single-field, no toast spam.
    setSections((s) =>
      s.map((sec) =>
        sec.id === lesson.section_id
          ? {
              ...sec,
              lessons: sec.lessons.map((l) =>
                l.id === lesson.id ? { ...l, requires_submission: value } : l,
              ),
            }
          : sec,
      ),
    );
    beginMutation();
    const { error } = await supabase
      .from("lessons")
      .update({ requires_submission: value })
      .eq("id", lesson.id);
    endMutation();
    if (error) {
      toast.error(error.message);
      // Revert
      setSections((s) =>
        s.map((sec) =>
          sec.id === lesson.section_id
            ? {
                ...sec,
                lessons: sec.lessons.map((l) =>
                  l.id === lesson.id ? { ...l, requires_submission: !value } : l,
                ),
              }
            : sec,
        ),
      );
    }
  }

  async function setAllLessonsRequiresSubmission(value: boolean) {
    const ids = sections.flatMap((s) => s.lessons.map((l) => l.id));
    if (ids.length === 0) return;
    const prev = sections;
    setSections((s) =>
      s.map((sec) => ({
        ...sec,
        lessons: sec.lessons.map((l) => ({ ...l, requires_submission: value })),
      })),
    );
    beginMutation();
    const { error } = await supabase
      .from("lessons")
      .update({ requires_submission: value })
      .in("id", ids);
    endMutation();
    if (error) {
      toast.error(error.message);
      setSections(prev);
      return;
    }
    toast.success(
      value
        ? `Marked ${ids.length} lesson${ids.length === 1 ? "" : "s"} as mandatory`
        : `Cleared mandatory flag on ${ids.length} lesson${ids.length === 1 ? "" : "s"}`,
    );
  }

  async function deleteLesson(lesson: Lesson) {
    const ok = await confirm({
      title: "Delete lesson?",
      description: `“${lesson.title}” will be removed.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    beginMutation();
    const { error } = await supabase.from("lessons").delete().eq("id", lesson.id);
    endMutation();
    if (error) toast.error(error.message);
    else
      setSections((s) =>
        s.map((sec) =>
          sec.id === lesson.section_id
            ? { ...sec, lessons: sec.lessons.filter((l) => l.id !== lesson.id) }
            : sec,
        ),
      );
  }

  // ----- Drag and drop -----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeDrag, setActiveDrag] = React.useState<
    | { kind: "section"; id: string; title: string }
    | { kind: "lesson"; id: string; title: string; type: LessonType }
    | null
  >(null);

  function findLessonContainer(lessonId: string): string | null {
    for (const sec of sections) {
      if (sec.lessons.some((l) => l.id === lessonId)) return sec.id;
    }
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    const data = e.active.data.current as
      | { kind: "section"; section: Section }
      | { kind: "lesson"; lesson: Lesson }
      | undefined;
    if (!data) return;
    if (data.kind === "section") {
      setActiveDrag({ kind: "section", id: data.section.id, title: data.section.title });
    } else {
      setActiveDrag({
        kind: "lesson",
        id: data.lesson.id,
        title: data.lesson.title,
        type: data.lesson.type,
      });
    }
  }

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveDrag(null);
    if (!over || active.id === over.id) return;

    const activeData = active.data.current as
      | { kind: "section"; section: Section }
      | { kind: "lesson"; lesson: Lesson }
      | undefined;
    if (!activeData) return;

    if (activeData.kind === "section") {
      const oldIdx = sections.findIndex((s) => s.id === active.id);
      const newIdx = sections.findIndex((s) => s.id === over.id);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      const next = arrayMove(sections, oldIdx, newIdx);
      await persistSectionOrder(next);
      return;
    }

    // Lesson drag
    const fromSectionId = findLessonContainer(active.id as string);
    if (!fromSectionId) return;

    // Determine target section: if over is a section drop zone, use that; if over is a lesson, use its section
    const overData = over.data.current as
      | { kind: "section"; section: Section }
      | { kind: "lesson"; lesson: Lesson }
      | { kind: "section-empty"; sectionId: string }
      | undefined;
    let toSectionId: string | null = null;
    let toIndex: number | null = null;
    if (overData?.kind === "lesson") {
      toSectionId = findLessonContainer(over.id as string);
      const toSec = sections.find((s) => s.id === toSectionId);
      if (toSec) toIndex = toSec.lessons.findIndex((l) => l.id === over.id);
    } else if (overData?.kind === "section-empty") {
      toSectionId = overData.sectionId;
      toIndex = 0;
    } else if (overData?.kind === "section") {
      toSectionId = overData.section.id;
      toIndex = overData.section.lessons.length;
    }
    if (!toSectionId || toIndex === null) return;

    const next = sections.map((s) => ({ ...s, lessons: [...s.lessons] }));
    const fromSec = next.find((s) => s.id === fromSectionId)!;
    const toSec = next.find((s) => s.id === toSectionId)!;
    const fromIdx = fromSec.lessons.findIndex((l) => l.id === active.id);
    if (fromIdx < 0) return;
    const [moved] = fromSec.lessons.splice(fromIdx, 1);
    if (fromSectionId === toSectionId) {
      // Adjust index after removal
      const adjusted = fromIdx < toIndex ? toIndex - 1 : toIndex;
      toSec.lessons.splice(adjusted, 0, moved);
    } else {
      toSec.lessons.splice(toIndex, 0, { ...moved, section_id: toSectionId });
    }
    await persistLessonChanges(next, new Set([fromSectionId, toSectionId]));
  }


  if (loading || !course) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ceo/courses">
            <ArrowLeft className="h-4 w-4" /> All courses
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          {statusSavedFlash && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-accent" /> Saved
            </span>
          )}
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-md">
            <span
              className={`text-xs ${course.status === "draft" ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Draft
            </span>
            <Switch
              checked={course.status === "published"}
              onCheckedChange={(v) => toggleStatus(v ? "published" : "draft")}
              aria-label="Toggle published status"
            />
            <span
              className={`text-xs ${course.status === "published" ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              Published
            </span>
          </div>
        </div>
      </div>

      {/* Course meta */}
      <Card>
        <CardHeader>
          <CardTitle>Course details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={course.title}
              onChange={(e) => setCourse({ ...course, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={course.description ?? ""}
              onChange={(e) => setCourse({ ...course, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Thumbnail</label>
            <div className="flex items-center gap-3">
              {course.thumbnail_url ? (
                <img
                  src={course.thumbnail_url}
                  alt="Thumbnail"
                  className="aspect-video h-20 w-36 rounded-md border border-white/10 object-cover"
                />
              ) : (
                <div className="flex aspect-video h-20 w-36 items-center justify-center rounded-md border border-dashed border-white/15 text-xs text-muted-foreground">
                  No image
                </div>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                <Upload className="h-4 w-4" /> Upload image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadThumbnail(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended 1280×720 (16:9). JPG, PNG or WebP, up to 5MB. Saves automatically.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={saveMeta} disabled={savingMeta || !metaDirty}>
              {metaSavedFlash ? (
                <>
                  <Check className="h-4 w-4" /> Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> {savingMeta ? "Saving…" : "Save details"}
                </>
              )}
            </Button>
            {metaDirty && !savingMeta && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Curriculum */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-3">
            <CardTitle>Curriculum</CardTitle>
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              aria-live="polite"
            >
              {mutationCount > 0 ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
                </>
              ) : curriculumSavedFlash ? (
                <>
                  <Check className="h-3.5 w-3.5 text-accent" /> All changes saved
                </>
              ) : sections.length > 0 ? (
                <>
                  <Check className="h-3.5 w-3.5 opacity-60" /> Auto-saved
                </>
              ) : null}
            </span>
          </div>
          <Button onClick={() => setSectionDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Add section
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sections.length === 0 && (
            <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No sections yet. Add your first section to start building lessons.
              </p>
              <Button
                onClick={() => setSectionDialogOpen(true)}
                size="sm"
                className="mt-3"
              >
                <Plus className="h-4 w-4" /> Add section
              </Button>
            </div>
          )}
          {(() => {
            const allLessons = sections.flatMap((s) => s.lessons);
            const total = allLessons.length;
            const mandatoryCount = allLessons.filter((l) => l.requires_submission).length;
            const allOn = total > 0 && mandatoryCount === total;
            const someOn = mandatoryCount > 0 && mandatoryCount < total;
            if (total === 0) return null;
            return (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-white/5 bg-muted/20 px-3 py-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={allOn ? true : someOn ? "indeterminate" : false}
                    onCheckedChange={(v) => setAllLessonsRequiresSubmission(v === true)}
                    aria-label="Mark all lessons as requiring submission"
                  />
                  <span className="font-medium">Mandatory submission</span>
                  <span className="text-xs text-muted-foreground">
                    {mandatoryCount} of {total} lesson{total === 1 ? "" : "s"} require a submission before the next lesson
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAllLessonsRequiresSubmission(true)}
                    disabled={allOn}
                  >
                    Mark all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setAllLessonsRequiresSubmission(false)}
                    disabled={mandatoryCount === 0}
                  >
                    Clear all
                  </Button>
                </div>
              </div>
            );
          })()}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {sections.map((section) => (
                  <SectionCard
                    key={section.id}
                    section={section}
                    onRename={(t) => renameSection(section.id, t)}
                    onDelete={() => deleteSection(section.id)}
                    onAddLesson={(type, title, content, duration) =>
                      addLesson(section.id, type, title, content, duration)
                    }
                    onUpdateLesson={updateLesson}
                    onDeleteLesson={deleteLesson}
                    onToggleRequiresSubmission={setLessonRequiresSubmission}
                    courseId={courseId}
                    onAutoThumbnail={maybeAutoSetThumbnail}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay>
              {activeDrag?.kind === "section" && (
                <div className="rounded-lg border bg-background p-3 shadow-lg">
                  <span className="font-medium">{activeDrag.title}</span>
                </div>
              )}
              {activeDrag?.kind === "lesson" &&
                (() => {
                  const Icon = LESSON_ICONS[activeDrag.type];
                  return (
                    <div className="flex items-center gap-2 rounded-md border bg-background p-2 shadow-lg">
                      <Icon className="h-4 w-4 text-accent" />
                      <span className="text-sm">{activeDrag.title}</span>
                    </div>
                  );
                })()}
            </DragOverlay>
          </DndContext>
          {sections.length > 0 && (
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-4 border-t border-white/5 bg-background/80 px-6 py-3 backdrop-blur-md">
              <Button
                onClick={() => setSectionDialogOpen(true)}
                size="sm"
                variant="outline"
                className="w-full"
              >
                <Plus className="h-4 w-4" /> Add section
              </Button>
            </div>
          )}
        </CardContent>
      </Card>


      <Dialog open={sectionDialogOpen} onOpenChange={setSectionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New section</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addSectionWithTitle(newSectionTitle);
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <label className="text-sm font-medium">Section title</label>
              <Input
                autoFocus
                value={newSectionTitle}
                onChange={(e) => setNewSectionTitle(e.target.value)}
                placeholder="e.g. Module 1 — Foundations"
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSectionDialogOpen(false);
                  setNewSectionTitle("");
                }}
              >
                Cancel
              </Button>
              <Button type="submit">Add section</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}




function SectionCard({
  section,
  onRename,
  onDelete,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onToggleRequiresSubmission,
  courseId,
  onAutoThumbnail,
}: {
  section: Section;
  onRename: (t: string) => void;
  onDelete: () => void;
  onAddLesson: (
    type: LessonType,
    title: string,
    content?: any,
    duration?: number | null,
  ) => Promise<void> | void;
  onUpdateLesson: (l: Lesson) => void;
  onDeleteLesson: (l: Lesson) => void;
  onToggleRequiresSubmission: (l: Lesson, v: boolean) => void;
  courseId: string;
  onAutoThumbnail?: (
    url: string | null | undefined,
    opts?: { force?: boolean },
  ) => void | Promise<void>;
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(section.title);
  const [open, setOpen] = React.useState(true);

  const sortable = useSortable({
    id: section.id,
    data: { kind: "section", section },
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  return (
    <div ref={sortable.setNodeRef} style={style}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={`group/section rounded-lg border transition-colors ${open ? "bg-muted/20" : "bg-background"}`}
      >
        <div className="flex items-center justify-between gap-2 p-3">
          <div className="flex flex-1 items-center gap-2">
            <button
              type="button"
              {...sortable.attributes}
              {...sortable.listeners}
              className="cursor-grab touch-none rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
              aria-label="Drag section"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left"
                aria-label={open ? "Collapse section" : "Expand section"}
              >
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`}
                />
                {!editing && (
                  <span className="font-medium">{section.title}</span>
                )}
                <Badge variant="secondary" className="ml-1">
                  {section.lessons.length}{" "}
                  {section.lessons.length === 1 ? "lesson" : "lessons"}
                </Badge>
              </button>
            </CollapsibleTrigger>
            {editing && (
              <Input
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  setEditing(false);
                  if (title.trim() && title !== section.title) onRename(title.trim());
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="h-8 max-w-sm"
              />
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Section actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setTitle(section.title);
                  setEditing(true);
                  setOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" /> Delete section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <CollapsibleContent className="space-y-2 border-t border-white/5 p-3">
          <SectionLessonsDroppable section={section}>
            <SortableContext
              items={section.lessons.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {section.lessons.length === 0 && (
                <div className="rounded-md border border-dashed bg-background/40 p-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    No lessons yet — add your first lesson below.
                  </p>
                </div>
              )}
              {section.lessons.map((l) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  onUpdate={onUpdateLesson}
                  onDelete={() => onDeleteLesson(l)}
                  onToggleRequiresSubmission={(v) => onToggleRequiresSubmission(l, v)}
                  courseId={courseId}
                />
              ))}
            </SortableContext>
          </SectionLessonsDroppable>
          <AddLessonDialog
            onAdd={onAddLesson}
            courseId={courseId}
            onAutoThumbnail={onAutoThumbnail}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function SectionLessonsDroppable({
  section,
  children,
}: {
  section: Section;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `section-empty-${section.id}`,
    data: { kind: "section-empty", sectionId: section.id },
  });
  return (
    <div
      ref={setNodeRef}
      className={`space-y-2 rounded-md transition-colors ${isOver ? "bg-accent/30 ring-1 ring-accent" : ""}`}
    >
      {children}
    </div>
  );
}

function AddLessonDialog({
  onAdd,
  courseId,
  onAutoThumbnail,
}: {
  onAdd: (
    type: LessonType,
    title: string,
    content?: any,
    duration?: number | null,
  ) => Promise<void> | void;
  courseId: string;
  onAutoThumbnail?: (
    url: string | null | undefined,
    opts?: { force?: boolean },
  ) => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<LessonType>("video");
  const [title, setTitle] = React.useState("");
  const [videoUrl, setVideoUrl] = React.useState("");
  const [videoPath, setVideoPath] = React.useState<string | null>(null);
  const [videoSource, setVideoSource] = React.useState<"link" | "upload" | "playlist">("link");
  const [duration, setDuration] = React.useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = React.useState("");
  const [pdfPath, setPdfPath] = React.useState<string | null>(null);
  const [pdfSource, setPdfSource] = React.useState<"link" | "upload">("link");
  const [practicalBrief, setPracticalBrief] = React.useState("");
  const [assignmentEnabled, setAssignmentEnabled] = React.useState(false);
  const [assignmentBrief, setAssignmentBrief] = React.useState("");
  const [assignmentAttachmentPath, setAssignmentAttachmentPath] = React.useState<string | null>(null);
  const [assignmentAttachmentName, setAssignmentAttachmentName] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState<null | "video" | "pdf" | "assignment">(null);

  // Playlist import state (only for video lessons)
  const [playlistUrl, setPlaylistUrl] = React.useState("");
  const [playlistLoading, setPlaylistLoading] = React.useState(false);
  const [playlistItems, setPlaylistItems] = React.useState<PlaylistVideo[]>([]);
  const [playlistTitle, setPlaylistTitle] = React.useState<string | null>(null);
  const [playlistSelected, setPlaylistSelected] = React.useState<Record<string, boolean>>({});
  const [playlistTitles, setPlaylistTitles] = React.useState<Record<string, string>>({});
  const [bulkAdding, setBulkAdding] = React.useState(false);
  const [bulkProgress, setBulkProgress] = React.useState<{ done: number; total: number } | null>(null);

  function reset() {
    setType("video");
    setTitle("");
    setVideoUrl("");
    setVideoPath(null);
    setVideoSource("link");
    setDuration(null);
    setPdfUrl("");
    setPdfPath(null);
    setPdfSource("link");
    setPracticalBrief("");
    setAssignmentEnabled(false);
    setAssignmentBrief("");
    setAssignmentAttachmentPath(null);
    setAssignmentAttachmentName(null);
    setPlaylistUrl("");
    setPlaylistItems([]);
    setPlaylistTitle(null);
    setPlaylistSelected({});
    setPlaylistTitles({});
    setBulkProgress(null);
  }

  async function loadPlaylist() {
    if (!playlistUrl.trim()) return;
    setPlaylistLoading(true);
    setPlaylistItems([]);
    try {
      const res = await fetchYoutubePlaylist(playlistUrl.trim());
      setPlaylistItems(res.items);
      setPlaylistTitle(res.playlistTitle);
      const sel: Record<string, boolean> = {};
      const titles: Record<string, string> = {};
      for (const it of res.items) {
        sel[it.videoId] = true;
        titles[it.videoId] = it.title;
      }
      setPlaylistSelected(sel);
      setPlaylistTitles(titles);
      toast.success(`Found ${res.items.length} video${res.items.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load playlist");
    } finally {
      setPlaylistLoading(false);
    }
  }

  async function bulkAddPlaylist() {
    const chosen = playlistItems.filter((it) => playlistSelected[it.videoId]);
    if (chosen.length === 0) {
      toast.error("Select at least one video.");
      return;
    }
    setBulkAdding(true);
    setBulkProgress({ done: 0, total: chosen.length });
    let added = 0;
    try {
      for (const it of chosen) {
        const lessonTitle = (playlistTitles[it.videoId] ?? it.title).trim() || it.title;
        await onAdd(
          "video",
          lessonTitle,
          { url: it.watchUrl, source: "link" },
          it.durationSeconds ?? null,
        );
        added += 1;
        setBulkProgress({ done: added, total: chosen.length });
      }
      // Auto-set course thumbnail from the first selected video (force: explicit playlist import)
      const firstThumb = chosen[0]?.thumbnailUrl ?? null;
      if (firstThumb && onAutoThumbnail) {
        await onAutoThumbnail(firstThumb, { force: true });
      }
      toast.success(`Added ${added} lesson${added === 1 ? "" : "s"} from playlist`);
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(
        `Added ${added}/${chosen.length}. ${err instanceof Error ? err.message : "Bulk add failed."}`,
      );
    } finally {
      setBulkAdding(false);
    }
  }

  async function uploadToBucket(file: File, prefix: string, kind: "video" | "pdf" | "assignment") {
    setUploading(kind);
    const ext = file.name.split(".").pop() ?? "bin";
    const path = `${prefix}/${courseId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("course-content")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(null);
    if (error) {
      toast.error(error.message);
      return null;
    }
    toast.success("Uploaded");
    return path;
  }

  function buildContent(): any {
    const assignment =
      assignmentEnabled && assignmentBrief.trim()
        ? {
            assignment: {
              brief: assignmentBrief.trim(),
              ...(assignmentAttachmentPath
                ? {
                    attachment_path: assignmentAttachmentPath,
                    attachment_name: assignmentAttachmentName,
                  }
                : {}),
            },
          }
        : {};
    if (type === "video") {
      return videoSource === "upload" && videoPath
        ? { path: videoPath, source: "upload", ...assignment }
        : { url: videoUrl.trim(), source: "link", ...assignment };
    }
    if (type === "pdf") {
      return pdfSource === "upload" && pdfPath
        ? { path: pdfPath, source: "upload", ...assignment }
        : { url: pdfUrl.trim(), source: "link", ...assignment };
    }
    if (type === "quiz")
      return { questions: [], passing_score: 70, max_attempts: 3, ...assignment };
    return { brief: practicalBrief.trim() };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd(type, title.trim(), buildContent(), duration);
    // Auto-set course thumbnail from a YouTube link lesson
    if (type === "video" && videoSource === "link" && onAutoThumbnail) {
      const thumb = getYouTubeThumbnail(videoUrl);
      if (thumb) await onAutoThumbnail(thumb);
    }
    reset();
    setOpen(false);
  }

  const supportsAssignment = type === "video" || type === "pdf" || type === "quiz";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-4 w-4" /> Add lesson
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New lesson</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={type} onValueChange={(v: LessonType) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="quiz">Quiz</SelectItem>
                  <SelectItem value="practical">Practical assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!(type === "video" && videoSource === "playlist") && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
            )}
          </div>

          {type === "video" && (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Video source</label>
                <Tabs
                  value={videoSource}
                  onValueChange={(v) => setVideoSource(v as "link" | "upload" | "playlist")}
                >
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="link">Paste link</TabsTrigger>
                    <TabsTrigger value="upload">Upload file</TabsTrigger>
                    <TabsTrigger value="playlist">
                      <ListVideo className="h-3.5 w-3.5" /> Playlist
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="link" className="space-y-2 pt-3">
                    <UrlAutoFillInput
                      value={videoUrl}
                      onChange={setVideoUrl}
                      onMetadata={(meta) => {
                        if (meta.title && !title.trim()) setTitle(meta.title);
                        if (meta.durationSeconds && !duration)
                          setDuration(Math.round(meta.durationSeconds));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      YouTube, Vimeo, Loom, Drive, or a direct .mp4 link. Click <strong>Auto-fill</strong> to pull title + duration.
                    </p>
                  </TabsContent>
                  <TabsContent value="upload" className="space-y-2 pt-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                      <Upload className="h-4 w-4" />
                      {uploading === "video" ? "Uploading…" : videoPath ? "Replace file" : "Choose video file"}
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          const p = await uploadToBucket(f, "videos", "video");
                          if (p) setVideoPath(p);
                        }}
                      />
                    </label>
                    {videoPath && (
                      <p className="break-all text-xs text-muted-foreground">Stored: {videoPath}</p>
                    )}
                  </TabsContent>
                  <TabsContent value="playlist" className="space-y-3 pt-3">
                    <p className="text-xs text-muted-foreground">
                      Paste a YouTube playlist link. We'll fetch every video and create one lesson per video in this section.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={playlistUrl}
                        onChange={(e) => setPlaylistUrl(e.target.value)}
                        placeholder="https://www.youtube.com/playlist?list=..."
                        disabled={playlistLoading || bulkAdding}
                      />
                      <Button
                        type="button"
                        onClick={loadPlaylist}
                        disabled={!playlistUrl.trim() || playlistLoading || bulkAdding}
                      >
                        {playlistLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Fetching…
                          </>
                        ) : (
                          "Fetch videos"
                        )}
                      </Button>
                    </div>

                    {playlistItems.length > 0 && (
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                        {playlistTitle && (
                          <p className="text-sm font-medium">{playlistTitle}</p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {Object.values(playlistSelected).filter(Boolean).length} of{" "}
                            {playlistItems.length} selected
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="underline"
                              onClick={() => {
                                const all: Record<string, boolean> = {};
                                playlistItems.forEach((it) => (all[it.videoId] = true));
                                setPlaylistSelected(all);
                              }}
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              className="underline"
                              onClick={() => setPlaylistSelected({})}
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                          {playlistItems.map((it) => (
                            <div
                              key={it.videoId}
                              className="flex items-center gap-2 rounded-md border bg-background p-2"
                            >
                              <Checkbox
                                checked={!!playlistSelected[it.videoId]}
                                onCheckedChange={(c) =>
                                  setPlaylistSelected((s) => ({
                                    ...s,
                                    [it.videoId]: !!c,
                                  }))
                                }
                                disabled={bulkAdding}
                              />
                              {it.thumbnailUrl && (
                                <img
                                  src={it.thumbnailUrl}
                                  alt=""
                                  className="h-10 w-16 rounded object-cover"
                                  loading="lazy"
                                />
                              )}
                              <Input
                                value={playlistTitles[it.videoId] ?? it.title}
                                onChange={(e) =>
                                  setPlaylistTitles((t) => ({
                                    ...t,
                                    [it.videoId]: e.target.value,
                                  }))
                                }
                                disabled={bulkAdding}
                                className="h-8 flex-1"
                              />
                              <Badge variant="outline" className="text-xs">
                                {formatDuration(it.durationSeconds)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
              {videoSource !== "playlist" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Duration (seconds, optional)</label>
                  <Input
                    type="number"
                    value={duration ?? ""}
                    onChange={(e) => setDuration(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              )}
            </>
          )}

          {type === "pdf" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">PDF source</label>
              <Tabs value={pdfSource} onValueChange={(v) => setPdfSource(v as "link" | "upload")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="link">Paste link</TabsTrigger>
                  <TabsTrigger value="upload">Upload file</TabsTrigger>
                </TabsList>
                <TabsContent value="link" className="space-y-2 pt-3">
                  <Input
                    value={pdfUrl}
                    onChange={(e) => setPdfUrl(e.target.value)}
                    placeholder="https://… public PDF URL"
                  />
                </TabsContent>
                <TabsContent value="upload" className="space-y-2 pt-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                    <Upload className="h-4 w-4" />
                    {uploading === "pdf" ? "Uploading…" : pdfPath ? "Replace file" : "Choose PDF file"}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const p = await uploadToBucket(f, "pdfs", "pdf");
                        if (p) setPdfPath(p);
                      }}
                    />
                  </label>
                  {pdfPath && (
                    <p className="break-all text-xs text-muted-foreground">Stored: {pdfPath}</p>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}

          {type === "practical" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Brief / instructions</label>
              <Textarea
                rows={5}
                value={practicalBrief}
                onChange={(e) => setPracticalBrief(e.target.value)}
                placeholder="What does the member need to do and submit?"
              />
            </div>
          )}

          {type === "quiz" && (
            <p className="text-xs text-muted-foreground">
              The lesson will be created with a blank quiz. Open the lesson after creating to add questions.
            </p>
          )}

          {supportsAssignment && !(type === "video" && videoSource === "playlist") && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Attach an assignment</p>
                  <p className="text-xs text-muted-foreground">
                    Optional. If added, members must submit it for this lesson to count as complete.
                  </p>
                </div>
                <Switch
                  checked={assignmentEnabled}
                  onCheckedChange={setAssignmentEnabled}
                  aria-label="Attach assignment"
                />
              </div>
              {assignmentEnabled && (
                <div className="space-y-2">
                  <Textarea
                    rows={4}
                    value={assignmentBrief}
                    onChange={(e) => setAssignmentBrief(e.target.value)}
                    placeholder="Describe the tech test or project the member must complete and submit."
                    required
                  />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Brief attachment (optional)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                        <Upload className="h-4 w-4" />
                        {uploading === "assignment"
                          ? "Uploading…"
                          : assignmentAttachmentPath
                            ? "Replace file"
                            : "Attach file (PDF, audio, video, doc…)"}
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            const p = await uploadToBucket(f, "assignments", "assignment");
                            if (p) {
                              setAssignmentAttachmentPath(p);
                              setAssignmentAttachmentName(f.name);
                            }
                          }}
                        />
                      </label>
                      {assignmentAttachmentName && (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          {assignmentAttachmentName}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setAssignmentAttachmentPath(null);
                              setAssignmentAttachmentName(null);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={bulkAdding}
            >
              Cancel
            </Button>
            {type === "video" && videoSource === "playlist" ? (
              <Button
                type="button"
                onClick={bulkAddPlaylist}
                disabled={
                  bulkAdding ||
                  playlistItems.length === 0 ||
                  Object.values(playlistSelected).filter(Boolean).length === 0
                }
              >
                {bulkAdding && bulkProgress
                  ? `Adding ${bulkProgress.done}/${bulkProgress.total}…`
                  : `Add ${Object.values(playlistSelected).filter(Boolean).length} lesson${
                      Object.values(playlistSelected).filter(Boolean).length === 1 ? "" : "s"
                    }`}
              </Button>
            ) : (
              <Button type="submit">Add lesson</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonRow({
  lesson,
  onUpdate,
  onDelete,
  onToggleRequiresSubmission,
  courseId,
}: {
  lesson: Lesson;
  onUpdate: (l: Lesson) => void;
  onDelete: () => void;
  onToggleRequiresSubmission: (v: boolean) => void;
  courseId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = LESSON_ICONS[lesson.type];

  const sortable = useSortable({
    id: lesson.id,
    data: { kind: "lesson", lesson },
  });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : 1,
  };

  const duration = formatLessonDuration(lesson.duration_seconds);

  return (
    <>
      <div
        ref={sortable.setNodeRef}
        style={style}
        className="group/lesson flex items-center gap-2 rounded-md border border-white/5 bg-background p-2 transition-colors hover:border-white/15"
      >
        <button
          type="button"
          {...sortable.attributes}
          {...sortable.listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground opacity-0 transition-opacity group-hover/lesson:opacity-100 hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
          aria-label="Drag lesson"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <button
          className="flex-1 text-left text-sm hover:underline"
          onClick={() => setOpen(true)}
        >
          {lesson.title}
        </button>
        {duration && (
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {duration}
          </span>
        )}
        <span
          className={`hidden rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide sm:inline ${LESSON_TYPE_CHIP[lesson.type]}`}
        >
          {LESSON_TYPE_LABEL[lesson.type]}
        </span>
        <label
          className="flex items-center gap-1.5 rounded border border-transparent px-1.5 py-1 text-[11px] text-muted-foreground hover:border-white/10 hover:bg-muted/30 cursor-pointer"
          title="Require a submission before the member can move to the next lesson"
        >
          <Checkbox
            checked={!!lesson.requires_submission}
            onCheckedChange={(v) => onToggleRequiresSubmission(v === true)}
            aria-label="Require submission before next lesson"
          />
          <span className="hidden sm:inline">Mandatory</span>
        </label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Lesson actions"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setOpen(true);
              }}
            >
              <Pencil className="h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                onDelete();
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <LessonEditorDialog
        open={open}
        onOpenChange={setOpen}
        lesson={lesson}
        onSave={onUpdate}
        courseId={courseId}
      />
    </>
  );
}

function LessonEditorDialog({
  open,
  onOpenChange,
  lesson,
  onSave,
  courseId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lesson: Lesson;
  onSave: (l: Lesson) => void;
  courseId: string;
}) {
  const [draft, setDraft] = React.useState<Lesson>(lesson);
  const [uploading, setUploading] = React.useState(false);

  React.useEffect(() => {
    setDraft(lesson);
  }, [lesson, open]);

  async function uploadFile(file: File, accept: "video" | "pdf") {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${courseId}/${lesson.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("course-content")
      .upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDraft((d) => ({ ...d, content: { ...d.content, path, type: accept } }));
    toast.success("Uploaded — remember to Save");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit lesson</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Mandatory submission</p>
              <p className="text-xs text-muted-foreground">
                Member must submit before unlocking the next lesson.
              </p>
            </div>
            <Switch
              checked={!!draft.requires_submission}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, requires_submission: v }))}
              aria-label="Mandatory submission"
            />
          </div>



          {draft.type === "video" && (
            <div className="space-y-3">
              <Tabs
                value={draft.content?.source === "upload" ? "upload" : "link"}
                onValueChange={(v) =>
                  setDraft((d) => ({ ...d, content: { ...d.content, source: v } }))
                }
              >
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="link">Paste link</TabsTrigger>
                  <TabsTrigger value="upload">Upload file</TabsTrigger>
                </TabsList>

                <TabsContent value="link" className="space-y-2 pt-3">
                  <label className="text-sm font-medium">Video URL</label>
                  <UrlAutoFillInput
                    value={draft.content?.url ?? ""}
                    onChange={(url) =>
                      setDraft((d) => ({
                        ...d,
                        content: { ...d.content, url, source: "link" },
                      }))
                    }
                    onMetadata={(meta) => {
                      setDraft((d) => {
                        const next: Lesson = { ...d };
                        // Only fill title if empty or still placeholder-ish
                        if (meta.title && (!d.title || d.title.trim() === "" || d.title === "New video lesson")) {
                          next.title = meta.title;
                        }
                        if (meta.durationSeconds && !d.duration_seconds) {
                          next.duration_seconds = Math.round(meta.durationSeconds);
                        }
                        return next;
                      });
                    }}
                  />
                  {(() => {
                    const u = (draft.content?.url ?? "").trim();
                    if (!u) {
                      return (
                        <p className="text-xs text-muted-foreground">
                          Members will watch the video inside the lesson page — no redirects.
                        </p>
                      );
                    }
                    const parsed = parseVideoUrl(u);
                    if (!parsed) {
                      return (
                        <p className="text-xs text-destructive">
                          Couldn't recognize this link. Supported: YouTube, Vimeo, Loom, Google Drive, or a direct .mp4/.webm URL.
                        </p>
                      );
                    }
                    const canBlockScrub = parsed.provider === "direct";
                    return (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Detected: <span className="font-medium capitalize">{parsed.provider}</span> — preview below.
                        </p>
                        {!canBlockScrub && (
                          <p className="text-xs text-muted-foreground italic">
                            Note: fast-forward blocking only works on uploaded files and direct .mp4 links — {parsed.provider} embeds use their own player.
                          </p>
                        )}
                        <div className="aspect-video w-full overflow-hidden rounded-md border bg-black">
                          {parsed.provider === "direct" ? (
                            <video src={parsed.embedUrl} controls className="h-full w-full" />
                          ) : (
                            <iframe
                              src={parsed.embedUrl}
                              className="h-full w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                              title="Video preview"
                            />
                          )}
                        </div>
                      </>
                    );
                  })()}
                </TabsContent>

                <TabsContent value="upload" className="space-y-2 pt-3">
                  <label className="text-sm font-medium">Upload video</label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                    <Upload className="h-4 w-4" />
                    {uploading ? "Uploading…" : "Choose file"}
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFile(f, "video");
                      }}
                    />
                  </label>
                  {draft.content?.path && (
                    <p className="break-all text-xs text-muted-foreground">
                      Stored: {draft.content.path}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Heavy files use storage. Prefer the “Paste link” tab when possible.
                  </p>
                </TabsContent>
              </Tabs>

              <div className="space-y-2">
                <label className="text-sm font-medium">Duration (seconds, optional)</label>
                <Input
                  type="number"
                  value={draft.duration_seconds ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      duration_seconds: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
            </div>
          )}

          {draft.type === "pdf" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload PDF</label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                <Upload className="h-4 w-4" />
                {uploading ? "Uploading…" : "Choose file"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadFile(f, "pdf");
                  }}
                />
              </label>
              {draft.content?.path && (
                <p className="break-all text-xs text-muted-foreground">
                  Stored: {draft.content.path}
                </p>
              )}
            </div>
          )}

          {draft.type === "practical" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Brief / instructions</label>
              <Textarea
                rows={6}
                value={draft.content?.brief ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, content: { ...draft.content, brief: e.target.value } })
                }
                placeholder="What does the member need to do and submit?"
              />
            </div>
          )}

          {draft.type === "quiz" && (
            <QuizEditor
              content={draft.content}
              onChange={(content) => setDraft({ ...draft, content })}
            />
          )}

          {(draft.type === "video" || draft.type === "pdf" || draft.type === "quiz") && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Attached assignment</p>
                  <p className="text-xs text-muted-foreground">
                    Optional. When attached, members must submit it for this lesson to count as complete.
                  </p>
                </div>
                <Switch
                  checked={!!draft.content?.assignment}
                  onCheckedChange={(v) =>
                    setDraft((d) => {
                      const { assignment, ...rest } = d.content ?? {};
                      return {
                        ...d,
                        content: v
                          ? { ...rest, assignment: { brief: assignment?.brief ?? "" } }
                          : rest,
                      };
                    })
                  }
                  aria-label="Attach assignment"
                />
              </div>
              {draft.content?.assignment && (
                <div className="space-y-2">
                  <Textarea
                    rows={4}
                    value={draft.content.assignment.brief ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        content: {
                          ...d.content,
                          assignment: { ...d.content.assignment, brief: e.target.value },
                        },
                      }))
                    }
                    placeholder="Describe the tech test or project the member must complete and submit."
                  />
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Brief attachment (optional)</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                        <Upload className="h-4 w-4" />
                        {uploading
                          ? "Uploading…"
                          : draft.content.assignment.attachment_path
                            ? "Replace file"
                            : "Attach file (PDF, audio, video, doc…)"}
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            setUploading(true);
                            const ext = f.name.split(".").pop() ?? "bin";
                            const path = `assignments/${courseId}/${crypto.randomUUID()}.${ext}`;
                            const { error } = await supabase.storage
                              .from("course-content")
                              .upload(path, f, { upsert: true, contentType: f.type });
                            setUploading(false);
                            if (error) {
                              toast.error(error.message);
                              return;
                            }
                            setDraft((d) => ({
                              ...d,
                              content: {
                                ...d.content,
                                assignment: {
                                  ...d.content.assignment,
                                  attachment_path: path,
                                  attachment_name: f.name,
                                },
                              },
                            }));
                            toast.success("Attached — remember to Save");
                          }}
                        />
                      </label>
                      {draft.content.assignment.attachment_name && (
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <FileText className="h-3.5 w-3.5" />
                          {draft.content.assignment.attachment_name}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() =>
                              setDraft((d) => {
                                const { attachment_path, attachment_name, ...rest } =
                                  d.content.assignment;
                                return {
                                  ...d,
                                  content: { ...d.content, assignment: rest },
                                };
                              })
                            }
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            <Save className="h-4 w-4" /> Save lesson
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface QuizQuestion {
  id: string;
  type: "mcq" | "tf" | "short";
  prompt: string;
  options?: string[];
  answer: string | number;
}

function QuizEditor({
  content,
  onChange,
}: {
  content: any;
  onChange: (c: any) => void;
}) {
  const questions: QuizQuestion[] = content?.questions ?? [];
  const passing = content?.passing_score ?? 70;
  const attempts = content?.max_attempts ?? 3;

  function update(patch: any) {
    onChange({ passing_score: passing, max_attempts: attempts, questions, ...patch });
  }

  function addQuestion(type: QuizQuestion["type"]) {
    const q: QuizQuestion =
      type === "mcq"
        ? {
            id: crypto.randomUUID(),
            type,
            prompt: "",
            options: ["", "", "", ""],
            answer: 0,
          }
        : type === "tf"
          ? { id: crypto.randomUUID(), type, prompt: "", answer: "true" }
          : { id: crypto.randomUUID(), type, prompt: "", answer: "" };
    update({ questions: [...questions, q] });
  }

  function updateQuestion(id: string, patch: Partial<QuizQuestion>) {
    update({
      questions: questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    });
  }

  function removeQuestion(id: string) {
    update({ questions: questions.filter((q) => q.id !== id) });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-sm font-medium">Passing score (%)</label>
          <Input
            type="number"
            min={0}
            max={100}
            value={passing}
            onChange={(e) => update({ passing_score: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium">Max attempts</label>
          <Input
            type="number"
            min={1}
            value={attempts}
            onChange={(e) => update({ max_attempts: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-3">
        {questions.map((q, idx) => (
          <div key={q.id} className="space-y-2 rounded-md border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase text-muted-foreground">
                Q{idx + 1} · {q.type}
              </span>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeQuestion(q.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              rows={2}
              placeholder="Question prompt"
              value={q.prompt}
              onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
            />
            {q.type === "mcq" && (
              <div className="space-y-2">
                {(q.options ?? []).map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`ans-${q.id}`}
                      checked={q.answer === i}
                      onChange={() => updateQuestion(q.id, { answer: i })}
                    />
                    <Input
                      value={opt}
                      placeholder={`Option ${i + 1}`}
                      onChange={(e) => {
                        const opts = [...(q.options ?? [])];
                        opts[i] = e.target.value;
                        updateQuestion(q.id, { options: opts });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {q.type === "tf" && (
              <Select
                value={String(q.answer)}
                onValueChange={(v) => updateQuestion(q.id, { answer: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">True</SelectItem>
                  <SelectItem value="false">False</SelectItem>
                </SelectContent>
              </Select>
            )}
            {q.type === "short" && (
              <Input
                placeholder="Expected answer (case-insensitive)"
                value={String(q.answer)}
                onChange={(e) => updateQuestion(q.id, { answer: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => addQuestion("mcq")}>
          <Plus className="h-3.5 w-3.5" /> Multiple choice
        </Button>
        <Button size="sm" variant="outline" onClick={() => addQuestion("tf")}>
          <Plus className="h-3.5 w-3.5" /> True / False
        </Button>
        <Button size="sm" variant="outline" onClick={() => addQuestion("short")}>
          <Plus className="h-3.5 w-3.5" /> Short answer
        </Button>
      </div>
    </div>
  );
}

function UrlAutoFillInput({
  value,
  onChange,
  onMetadata,
}: {
  value: string;
  onChange: (url: string) => void;
  onMetadata: (meta: { title: string | null; durationSeconds: number | null }) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const lastFetched = React.useRef<string>("");

  async function tryFetch(url: string) {
    const trimmed = url.trim();
    if (!trimmed || trimmed === lastFetched.current) return;
    const parsed = parseVideoUrl(trimmed);
    if (!parsed) return;
    lastFetched.current = trimmed;
    setBusy(true);
    const meta = await fetchVideoMetadata(trimmed);
    setBusy(false);
    if (!meta) return;
    if (meta.title || meta.durationSeconds) {
      onMetadata({ title: meta.title, durationSeconds: meta.durationSeconds });
      const bits: string[] = [];
      if (meta.title) bits.push("title");
      if (meta.durationSeconds) bits.push("duration");
      if (bits.length) toast.success(`Auto-filled ${bits.join(" + ")} from ${meta.provider}`);
    }
  }

  return (
    <div className="flex gap-2">
      <Input
        type="url"
        placeholder="https://www.youtube.com/watch?v=… (YouTube, Vimeo, Loom, Drive, or .mp4)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => tryFetch(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text");
          // Slight delay so onChange fires first
          setTimeout(() => tryFetch(pasted), 50);
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy || !value.trim()}
        onClick={() => {
          lastFetched.current = ""; // force refetch
          tryFetch(value);
        }}
      >
        {busy ? "Fetching…" : "Auto-fill"}
      </Button>
    </div>
  );
}
