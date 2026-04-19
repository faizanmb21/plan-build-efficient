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
import { parseVideoUrl } from "@/lib/video-embed";
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
    else toast.success("Saved");
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

  async function addSection() {
    const title = prompt("Section title");
    if (!title?.trim()) return;
    const position = sections.length;
    const { data, error } = await supabase
      .from("sections")
      .insert({ course_id: courseId, title: title.trim(), position })
      .select("id,title,position")
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setSections((s) => [...s, { ...data, lessons: [] }]);
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

  async function addLesson(sectionId: string, type: LessonType, title: string) {
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
        content: defaultContent[type] as Json,
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
        <Badge variant={course.status === "published" ? "default" : "secondary"}>
          {course.status}
        </Badge>
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
          <Button onClick={addSection} size="sm">
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
              onAddLesson={(type, title) => addLesson(section.id, type, title)}
              onUpdateLesson={updateLesson}
              onDeleteLesson={deleteLesson}
              onMoveLesson={(i, dir) => moveLesson(section.id, i, dir)}
              courseId={courseId}
            />
          ))}
        </CardContent>
      </Card>
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
  onAddLesson: (type: LessonType, title: string) => void;
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
        <AddLessonDialog onAdd={onAddLesson} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function AddLessonDialog({ onAdd }: { onAdd: (type: LessonType, title: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<LessonType>("video");
  const [title, setTitle] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd(type, title.trim());
    setTitle("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-4 w-4" /> Add lesson
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New lesson</DialogTitle>
          </DialogHeader>
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
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <DialogFooter>
            <Button type="submit">Add</Button>
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
                  <Input
                    type="url"
                    placeholder="https://www.youtube.com/watch?v=… (YouTube, Vimeo, Loom, Drive, or .mp4)"
                    value={draft.content?.url ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        content: { ...draft.content, url: e.target.value, source: "link" },
                      })
                    }
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
                    return (
                      <>
                        <p className="text-xs text-muted-foreground">
                          Detected: <span className="font-medium capitalize">{parsed.provider}</span> — preview below.
                        </p>
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
