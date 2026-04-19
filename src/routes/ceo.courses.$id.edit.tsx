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
import { parseVideoUrl } from "@/lib/video-embed";
import { fetchVideoMetadata } from "@/lib/video-metadata";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchYoutubePlaylist,
  formatDuration,
  type PlaylistVideo,
} from "@/lib/youtube-playlist";
import { ListVideo, Loader2 } from "lucide-react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Upload,
  Video,
  FileText,
  HelpCircle,
  ClipboardCheck,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { Json } from "@/integrations/supabase/types";

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
}

const LESSON_ICONS: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  pdf: FileText,
  quiz: HelpCircle,
  practical: ClipboardCheck,
};

function CourseEditor() {
  const { id: courseId } = Route.useParams();
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
          .select("id,section_id,title,type,position,duration_seconds,content")
          .order("position"),
      ]);
    if (cErr || sErr || lErr) {
      toast.error((cErr || sErr || lErr)!.message);
      setLoading(false);
      return;
    }
    setCourse(c);
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
        status: course.status,
        thumbnail_url: course.thumbnail_url,
      })
      .eq("id", courseId);
    setSavingMeta(false);
    if (error) toast.error(error.message);
    else toast.success("Course details saved");
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
      toast.success(next === "published" ? "Course published" : "Course set to draft");
    }
  }

  async function uploadThumbnail(file: File) {
    const ext = file.name.split(".").pop();
    const path = `${courseId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("thumbnails").upload(path, file, {
      upsert: true,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data } = supabase.storage.from("thumbnails").getPublicUrl(path);
    setCourse((c) => (c ? { ...c, thumbnail_url: data.publicUrl } : c));
    toast.success("Thumbnail uploaded — remember to Save");
  }

  async function addSectionWithTitle(rawTitle: string) {
    const title = rawTitle.trim();
    if (!title) return;
    const position = sections.length;
    const { data, error } = await supabase
      .from("sections")
      .insert({ course_id: courseId, title, position })
      .select("id,title,position")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setSections((s) => [...s, { ...data, lessons: [] }]);
    setNewSectionTitle("");
    setSectionDialogOpen(false);
  }

  async function renameSection(id: string, title: string) {
    const { error } = await supabase.from("sections").update({ title }).eq("id", id);
    if (error) toast.error(error.message);
    else setSections((s) => s.map((sec) => (sec.id === id ? { ...sec, title } : sec)));
  }

  async function deleteSection(id: string) {
    if (!confirm("Delete this section and its lessons?")) return;
    const { error } = await supabase.from("sections").delete().eq("id", id);
    if (error) toast.error(error.message);
    else setSections((s) => s.filter((sec) => sec.id !== id));
  }

  async function moveSection(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    const a = sections[idx];
    const b = sections[target];
    const next = [...sections];
    next[idx] = { ...b, position: idx };
    next[target] = { ...a, position: target };
    setSections(next);
    await Promise.all([
      supabase.from("sections").update({ position: idx }).eq("id", b.id),
      supabase.from("sections").update({ position: target }).eq("id", a.id),
    ]);
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
      .select("id,section_id,title,type,position,duration_seconds,content")
      .single();
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
    const { error } = await supabase
      .from("lessons")
      .update({
        title: lesson.title,
        content: lesson.content,
        duration_seconds: lesson.duration_seconds,
      })
      .eq("id", lesson.id);
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

  async function deleteLesson(lesson: Lesson) {
    if (!confirm("Delete this lesson?")) return;
    const { error } = await supabase.from("lessons").delete().eq("id", lesson.id);
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

  async function moveLesson(sectionId: string, idx: number, dir: -1 | 1) {
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const target = idx + dir;
    if (target < 0 || target >= sec.lessons.length) return;
    const a = sec.lessons[idx];
    const b = sec.lessons[target];
    const nextLessons = [...sec.lessons];
    nextLessons[idx] = { ...b, position: idx };
    nextLessons[target] = { ...a, position: target };
    setSections((s) => s.map((x) => (x.id === sectionId ? { ...x, lessons: nextLessons } : x)));
    await Promise.all([
      supabase.from("lessons").update({ position: idx }).eq("id", b.id),
      supabase.from("lessons").update({ position: target }).eq("id", a.id),
    ]);
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
          <Badge variant={course.status === "published" ? "default" : "secondary"}>
            {course.status}
          </Badge>
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Draft</span>
            <Switch
              checked={course.status === "published"}
              onCheckedChange={(v) => toggleStatus(v ? "published" : "draft")}
              aria-label="Toggle published status"
            />
            <span className="text-xs text-muted-foreground">Published</span>
          </div>
        </div>
      </div>

      {/* Course meta */}
      <Card>
        <CardHeader>
          <CardTitle>Course details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <Input
                value={course.title}
                onChange={(e) => setCourse({ ...course, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={course.status}
                onValueChange={(v: "draft" | "published") =>
                  setCourse({ ...course, status: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
              {course.thumbnail_url && (
                <img
                  src={course.thumbnail_url}
                  alt="Thumbnail"
                  className="h-16 w-28 rounded object-cover"
                />
              )}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground">
                <Upload className="h-4 w-4" /> Upload image
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadThumbnail(f);
                  }}
                />
              </label>
            </div>
          </div>
          <div>
            <Button onClick={saveMeta} disabled={savingMeta}>
              <Save className="h-4 w-4" /> {savingMeta ? "Saving…" : "Save details"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Curriculum */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Curriculum</CardTitle>
          <Button onClick={() => setSectionDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Add section
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {sections.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No sections yet. Add your first section to start building lessons.
            </p>
          )}
          {sections.map((section, idx) => (
            <SectionCard
              key={section.id}
              section={section}
              isFirst={idx === 0}
              isLast={idx === sections.length - 1}
              onMoveUp={() => moveSection(idx, -1)}
              onMoveDown={() => moveSection(idx, 1)}
              onRename={(t) => renameSection(section.id, t)}
              onDelete={() => deleteSection(section.id)}
              onAddLesson={(type, title, content, duration) =>
                addLesson(section.id, type, title, content, duration)
              }
              onUpdateLesson={updateLesson}
              onDeleteLesson={deleteLesson}
              onMoveLesson={(i, dir) => moveLesson(section.id, i, dir)}
              courseId={courseId}
            />
          ))}
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
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRename,
  onDelete,
  onAddLesson,
  onUpdateLesson,
  onDeleteLesson,
  onMoveLesson,
  courseId,
}: {
  section: Section;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
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
  onMoveLesson: (idx: number, dir: -1 | 1) => void;
  courseId: string;
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(section.title);
  const [open, setOpen] = React.useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex flex-1 items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <ChevronDown
                className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
              />
            </Button>
          </CollapsibleTrigger>
          {editing ? (
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
              className="h-8"
            />
          ) : (
            <button
              className="text-left font-medium hover:underline"
              onClick={() => setEditing(true)}
            >
              {section.title}
            </button>
          )}
          <Badge variant="secondary" className="ml-1">
            {section.lessons.length} {section.lessons.length === 1 ? "lesson" : "lessons"}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" disabled={isFirst} onClick={onMoveUp}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" disabled={isLast} onClick={onMoveDown}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CollapsibleContent className="space-y-2 border-t bg-muted/30 p-3">
        {section.lessons.map((l, i) => (
          <LessonRow
            key={l.id}
            lesson={l}
            isFirst={i === 0}
            isLast={i === section.lessons.length - 1}
            onMoveUp={() => onMoveLesson(i, -1)}
            onMoveDown={() => onMoveLesson(i, 1)}
            onUpdate={onUpdateLesson}
            onDelete={() => onDeleteLesson(l)}
            courseId={courseId}
          />
        ))}
        <AddLessonDialog onAdd={onAddLesson} courseId={courseId} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function AddLessonDialog({
  onAdd,
  courseId,
}: {
  onAdd: (
    type: LessonType,
    title: string,
    content?: any,
    duration?: number | null,
  ) => Promise<void> | void;
  courseId: string;
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(type, title.trim(), buildContent(), duration);
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

          {supportsAssignment && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Attach a tech-test / project</p>
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add lesson</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LessonRow({
  lesson,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onUpdate,
  onDelete,
  courseId,
}: {
  lesson: Lesson;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdate: (l: Lesson) => void;
  onDelete: () => void;
  courseId: string;
}) {
  const [open, setOpen] = React.useState(false);
  const Icon = LESSON_ICONS[lesson.type];

  return (
    <>
      <div className="flex items-center gap-2 rounded-md border bg-background p-2">
        <Icon className="h-4 w-4 text-accent" />
        <button
          className="flex-1 text-left text-sm hover:underline"
          onClick={() => setOpen(true)}
        >
          {lesson.title}
        </button>
        <Badge variant="outline" className="text-xs capitalize">
          {lesson.type}
        </Badge>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isFirst} onClick={onMoveUp}>
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          disabled={isLast}
          onClick={onMoveDown}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
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
                  <p className="text-sm font-medium">Attached tech-test / project</p>
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
