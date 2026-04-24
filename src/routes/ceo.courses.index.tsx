import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  BookOpen,
  Pencil,
  Trash2,
  ListVideo,
  Loader2,
  Sparkles,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  fetchYoutubePlaylist,
  formatDuration,
  type PlaylistVideo,
} from "@/lib/youtube-playlist";

export const Route = createFileRoute("/ceo/courses/")({
  component: CoursesPage,
});

interface Course {
  id: string;
  title: string;
  description: string | null;
  status: "draft" | "published";
  thumbnail_url: string | null;
  updated_at: string;
}

function CoursesPage() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [courses, setCourses] = React.useState<Course[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("courses")
      .select("id,title,description,status,thumbnail_url,updated_at")
      .order("updated_at", { ascending: false });
    if (error) toast.error(error.message);
    else setCourses(data ?? []);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function deleteCourse(id: string, title: string) {
    const ok = await confirm({
      title: "Delete course?",
      description: `“${title}” and all its sections, lessons and submissions will be permanently deleted.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Deleted");
      load();
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Courses</h1>
          <p className="text-sm text-muted-foreground">
            Build courses with sections, lessons, quizzes and practicals.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" /> New course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>New course</DialogTitle>
            </DialogHeader>
            <NewCourseTabs
              onCreated={(id) => {
                setOpen(false);
                toast.success("Course created");
                navigate({ to: "/ceo/courses/$id/edit", params: { id } });
              }}
            />
          </DialogContent>
        </Dialog>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No courses yet. Create your first one to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <Card key={c.id} className="flex flex-col overflow-hidden">
              <div className="relative aspect-video w-full bg-muted">
                {c.thumbnail_url ? (
                  <img
                    src={c.thumbnail_url}
                    alt={c.title}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <BookOpen className="h-8 w-8" />
                      <span className="text-2xl font-semibold">
                        {c.title.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  </div>
                )}
                <Badge
                  variant={c.status === "published" ? "default" : "secondary"}
                  className="absolute right-2 top-2"
                >
                  {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                </Badge>
              </div>
              <CardHeader className="space-y-0 pb-2">
                <CardTitle className="text-base line-clamp-1">{c.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {c.description || "No description"}
                </p>
                <div className="flex items-center gap-2">
                  <Button asChild size="icon" variant="ghost" aria-label="Preview as member">
                    <a
                      href={`/member/courses/${c.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Eye className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link to="/ceo/courses/$id/edit" params={{ id: c.id }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteCourse(c.id, c.title)}
                    aria-label="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// New-course dialog body — playlist-first, with Custom fallback
// ---------------------------------------------------------------------------

function NewCourseTabs({ onCreated }: { onCreated: (id: string) => void }) {
  return (
    <Tabs defaultValue="playlist" className="space-y-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="playlist">
          <Sparkles className="h-3.5 w-3.5" /> From YouTube playlist
        </TabsTrigger>
        <TabsTrigger value="custom">Custom</TabsTrigger>
      </TabsList>
      <TabsContent value="playlist">
        <PlaylistCreate onCreated={onCreated} />
      </TabsContent>
      <TabsContent value="custom">
        <CustomCreate onCreated={onCreated} />
      </TabsContent>
    </Tabs>
  );
}

function CustomCreate({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { data, error } = await supabase
      .from("courses")
      .insert({ title: title.trim(), description: description.trim() || null })
      .select("id")
      .single();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onCreated(data.id);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Title</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Customer onboarding fundamentals"
          required
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional summary"
          rows={3}
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create & edit"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PlaylistCreate({ onCreated }: { onCreated: (id: string) => void }) {
  const [playlistUrl, setPlaylistUrl] = React.useState("");
  const [fetching, setFetching] = React.useState(false);
  const [items, setItems] = React.useState<PlaylistVideo[]>([]);
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [thumbnailUrl, setThumbnailUrl] = React.useState<string | null>(null);
  const [strategy, setStrategy] = React.useState<"single" | "chunk">("single");
  const [chunkSize, setChunkSize] = React.useState(5);
  const [creating, setCreating] = React.useState(false);

  async function loadPlaylist() {
    if (!playlistUrl.trim()) return;
    setFetching(true);
    setItems([]);
    try {
      const res = await fetchYoutubePlaylist(playlistUrl.trim());
      setItems(res.items);
      const sel: Record<string, boolean> = {};
      for (const it of res.items) sel[it.videoId] = true;
      setSelected(sel);
      if (res.playlistTitle && !title) setTitle(res.playlistTitle);
      const firstThumb = res.items[0]?.thumbnailUrl ?? null;
      if (firstThumb) setThumbnailUrl(firstThumb);
      toast.success(`Found ${res.items.length} video${res.items.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load playlist");
    } finally {
      setFetching(false);
    }
  }

  const chosen = React.useMemo(
    () => items.filter((it) => selected[it.videoId]),
    [items, selected],
  );
  const totalSeconds = React.useMemo(
    () => chosen.reduce((acc, it) => acc + (it.durationSeconds ?? 0), 0),
    [chosen],
  );

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Course title is required");
      return;
    }
    if (chosen.length === 0) {
      toast.error("Select at least one video to include");
      return;
    }
    setCreating(true);

    // 1. Insert course
    const { data: course, error: courseErr } = await supabase
      .from("courses")
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        thumbnail_url: thumbnailUrl,
      })
      .select("id")
      .single();

    if (courseErr || !course) {
      setCreating(false);
      toast.error(courseErr?.message ?? "Failed to create course");
      return;
    }
    const courseId = course.id;

    try {
      // 2. Build section groups
      const groups: { title: string; videos: PlaylistVideo[] }[] = [];
      if (strategy === "single") {
        groups.push({ title: "All lessons", videos: chosen });
      } else {
        const size = Math.max(1, Math.floor(chunkSize) || 1);
        for (let i = 0; i < chosen.length; i += size) {
          const idx = Math.floor(i / size) + 1;
          groups.push({
            title: `Section ${idx}`,
            videos: chosen.slice(i, i + size),
          });
        }
      }

      // 3. Insert sections
      const sectionRows = groups.map((g, i) => ({
        course_id: courseId,
        title: g.title,
        position: i,
      }));
      const { data: sections, error: secErr } = await supabase
        .from("sections")
        .insert(sectionRows)
        .select("id,position");
      if (secErr || !sections) throw new Error(secErr?.message ?? "Failed to create sections");

      // Map position → section id (sort to be safe)
      const byPos = new Map<number, string>();
      sections.forEach((s) => byPos.set(s.position, s.id));

      // 4. Insert lessons
      const lessonRows: Array<{
        section_id: string;
        title: string;
        type: "video";
        position: number;
        duration_seconds: number | null;
        content: { video_url: string; storage_path: null };
      }> = [];
      groups.forEach((g, gi) => {
        const sectionId = byPos.get(gi)!;
        g.videos.forEach((v, vi) => {
          lessonRows.push({
            section_id: sectionId,
            title: v.title,
            type: "video",
            position: vi,
            duration_seconds: v.durationSeconds,
            content: { video_url: v.watchUrl, storage_path: null },
          });
        });
      });

      const { error: lessonErr } = await supabase.from("lessons").insert(lessonRows);
      if (lessonErr) throw new Error(lessonErr.message);

      onCreated(courseId);
    } catch (err) {
      // Cleanup: delete the half-built course
      await supabase.from("courses").delete().eq("id", courseId);
      toast.error(err instanceof Error ? err.message : "Failed to import playlist");
    } finally {
      setCreating(false);
    }
  }

  return (
    <form onSubmit={createCourse} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">YouTube playlist URL</label>
        <div className="flex gap-2">
          <Input
            value={playlistUrl}
            onChange={(e) => setPlaylistUrl(e.target.value)}
            placeholder="https://youtube.com/playlist?list=…"
          />
          <Button
            type="button"
            variant="outline"
            onClick={loadPlaylist}
            disabled={fetching || !playlistUrl.trim()}
          >
            {fetching ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Fetching…
              </>
            ) : (
              <>
                <ListVideo className="h-4 w-4" /> Fetch
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          We'll auto-fill the course title, thumbnail, and create one lesson per video.
        </p>
      </div>

      {items.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr]">
            {thumbnailUrl && (
              <div className="aspect-video overflow-hidden rounded-md border border-white/10 bg-muted">
                <img
                  src={thumbnailUrl}
                  alt="Course thumbnail"
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="space-y-2">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Course title"
                required
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {chosen.length} of {items.length} selected
              </span>
              <span className="text-muted-foreground">
                Total {formatDuration(totalSeconds)}
              </span>
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border border-white/10 divide-y divide-white/5">
              {items.map((it) => (
                <label
                  key={it.videoId}
                  className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/5"
                >
                  <Checkbox
                    checked={!!selected[it.videoId]}
                    onCheckedChange={(v) =>
                      setSelected((s) => ({ ...s, [it.videoId]: v === true }))
                    }
                  />
                  <span className="flex-1 truncate text-sm">{it.title}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDuration(it.durationSeconds)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Section strategy</Label>
            <RadioGroup
              value={strategy}
              onValueChange={(v) => setStrategy(v as "single" | "chunk")}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="single" id="strat-single" />
                <Label htmlFor="strat-single" className="font-normal">
                  Single section — one flat list
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="chunk" id="strat-chunk" />
                <Label htmlFor="strat-chunk" className="font-normal">
                  Auto-chapter every
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  className="h-8 w-20"
                  onFocus={() => setStrategy("chunk")}
                />
                <span className="text-sm text-muted-foreground">videos</span>
              </div>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button type="submit" disabled={creating || chosen.length === 0}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Creating…
                </>
              ) : (
                <>Create course with {chosen.length} lesson{chosen.length === 1 ? "" : "s"}</>
              )}
            </Button>
          </DialogFooter>
        </>
      )}
    </form>
  );
}
