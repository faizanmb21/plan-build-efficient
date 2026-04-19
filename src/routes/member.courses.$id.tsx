import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Video,
  FileText,
  HelpCircle,
  ClipboardCheck,
  CheckCircle2,
  Circle,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { parseVideoUrl } from "@/lib/video-embed";

export const Route = createFileRoute("/member/courses/$id")({
  component: CoursePlayer,
  errorComponent: ({ error }) => (
    <div className="p-6">
      <p className="text-sm text-destructive">Error: {error.message}</p>
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to="/member">Back to My Courses</Link>
      </Button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6">
      <p className="text-sm">Course not found.</p>
    </div>
  ),
});

type LessonType = "video" | "pdf" | "quiz" | "practical";
type Lesson = {
  id: string;
  title: string;
  type: LessonType;
  position: number;
  content: any;
  section_id: string;
};
type Section = { id: string; title: string; position: number; lessons: Lesson[] };
type ProgressRow = {
  lesson_id: string;
  completed: boolean;
  progress_percent: number;
  last_position: number;
};

const ICONS: Record<LessonType, React.ComponentType<{ className?: string }>> = {
  video: Video,
  pdf: FileText,
  quiz: HelpCircle,
  practical: ClipboardCheck,
};

function CoursePlayer() {
  const { id: courseId } = Route.useParams();
  const { user } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [course, setCourse] = React.useState<{ title: string; description: string | null } | null>(
    null,
  );
  const [sections, setSections] = React.useState<Section[]>([]);
  const [progress, setProgress] = React.useState<Record<string, ProgressRow>>({});
  const [activeLessonId, setActiveLessonId] = React.useState<string | null>(null);

  const allLessons = React.useMemo(() => sections.flatMap((s) => s.lessons), [sections]);
  const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? null;
  const completedCount = Object.values(progress).filter((p) => p.completed).length;
  const totalCount = allLessons.length;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  const load = React.useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: c } = await supabase
      .from("courses")
      .select("title,description")
      .eq("id", courseId)
      .single();
    setCourse(c);

    const { data: secs } = await supabase
      .from("sections")
      .select("id,title,position")
      .eq("course_id", courseId)
      .order("position");
    const sectionIds = (secs ?? []).map((s) => s.id);
    const { data: lessons } = sectionIds.length
      ? await supabase
          .from("lessons")
          .select("id,title,type,position,content,section_id")
          .in("section_id", sectionIds)
          .order("position")
      : { data: [] as Lesson[] };

    const built: Section[] = (secs ?? []).map((s) => ({
      ...s,
      lessons: ((lessons ?? []) as Lesson[])
        .filter((l) => l.section_id === s.id)
        .sort((a, b) => a.position - b.position),
    }));
    setSections(built);

    const lessonIds = (lessons ?? []).map((l) => l.id);
    const { data: prog } = lessonIds.length
      ? await supabase
          .from("lesson_progress")
          .select("lesson_id,completed,progress_percent,last_position")
          .eq("user_id", user.id)
          .in("lesson_id", lessonIds)
      : { data: [] as ProgressRow[] };
    const map: Record<string, ProgressRow> = {};
    for (const p of prog ?? []) map[p.lesson_id] = p;
    setProgress(map);

    // Pick first incomplete lesson, else first
    const flat = built.flatMap((s) => s.lessons);
    const next = flat.find((l) => !map[l.id]?.completed) ?? flat[0] ?? null;
    setActiveLessonId((cur) => cur ?? next?.id ?? null);

    setLoading(false);
  }, [courseId, user]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function markCompleted(lessonId: string) {
    if (!user) return;
    const { error } = await supabase.from("lesson_progress").upsert(
      {
        user_id: user.id,
        lesson_id: lessonId,
        completed: true,
        progress_percent: 100,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lesson_id" },
    );
    if (error) {
      toast.error(error.message);
      return;
    }
    setProgress((p) => ({
      ...p,
      [lessonId]: {
        lesson_id: lessonId,
        completed: true,
        progress_percent: 100,
        last_position: p[lessonId]?.last_position ?? 0,
      },
    }));
    toast.success("Lesson completed");
    // Auto-advance
    const idx = allLessons.findIndex((l) => l.id === lessonId);
    const next = allLessons[idx + 1];
    if (next) setActiveLessonId(next.id);
  }

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/member">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {completedCount} / {totalCount} lessons · {pct}%
          </span>
          <div className="w-32">
            <Progress value={pct} />
          </div>
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{course?.title}</h1>
        {course?.description && (
          <p className="text-sm text-muted-foreground">{course.description}</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="order-2 lg:order-1">
          {activeLesson ? (
            <LessonView
              lesson={activeLesson}
              done={!!progress[activeLesson.id]?.completed}
              onComplete={() => markCompleted(activeLesson.id)}
              onSubmissionSaved={() => load()}
              userId={user?.id ?? ""}
            />
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                This course has no lessons yet.
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="order-1 lg:order-2 space-y-3">
          {sections.map((s) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="p-2 pt-0">
                <ul className="space-y-1">
                  {s.lessons.map((l) => {
                    const Icon = ICONS[l.type];
                    const done = progress[l.id]?.completed;
                    const active = l.id === activeLessonId;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => setActiveLessonId(l.id)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            active
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0" />
                          )}
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 truncate">{l.title}</span>
                        </button>
                      </li>
                    );
                  })}
                  {s.lessons.length === 0 && (
                    <li className="px-2 py-1 text-xs text-muted-foreground">No lessons</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ))}
        </aside>
      </div>
    </div>
  );
}

function LessonView({
  lesson,
  done,
  onComplete,
  onSubmissionSaved,
  userId,
}: {
  lesson: Lesson;
  done: boolean;
  onComplete: () => void;
  onSubmissionSaved: () => void;
  userId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{lesson.title}</CardTitle>
          <Badge variant={done ? "default" : "secondary"}>{done ? "Completed" : lesson.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {lesson.type === "video" && (
          <VideoPlayer path={lesson.content?.path} url={lesson.content?.url} />
        )}
        {lesson.type === "pdf" && <PdfViewer path={lesson.content?.path} />}
        {lesson.type === "quiz" && <QuizRunner content={lesson.content} onPass={onComplete} done={done} />}
        {lesson.type === "practical" && (
          <PracticalSubmit
            lessonId={lesson.id}
            brief={lesson.content?.brief}
            userId={userId}
            onSubmitted={() => {
              onComplete();
              onSubmissionSaved();
            }}
          />
        )}

        {(lesson.type === "video" || lesson.type === "pdf") && (
          <div className="flex justify-end">
            <Button onClick={onComplete} disabled={done} size="sm">
              {done ? "Completed" : "Mark as completed"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function useSignedUrl(bucket: string, path: string | undefined) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!path) return;
    (async () => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
      if (cancelled) return;
      if (error) {
        toast.error(error.message);
        return;
      }
      setUrl(data.signedUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [bucket, path]);
  return url;
}

/**
 * Video element that prevents fast-forwarding past the furthest point already watched.
 * Rewinding is allowed. Only works for HTMLVideoElement (uploaded files / direct .mp4).
 */
function NoSeekVideo({ src }: { src: string }) {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const maxWatched = React.useRef(0);
  const seekedToast = React.useRef(0);

  return (
    <video
      ref={ref}
      key={src}
      src={src}
      controls
      controlsList="nodownload"
      onContextMenu={(e) => e.preventDefault()}
      onTimeUpdate={(e) => {
        const t = e.currentTarget.currentTime;
        if (t > maxWatched.current) maxWatched.current = t;
      }}
      onSeeking={(e) => {
        const v = e.currentTarget;
        // Allow a small buffer (1.5s) so natural buffering doesn't trigger a snap-back
        if (v.currentTime > maxWatched.current + 1.5) {
          v.currentTime = maxWatched.current;
          const now = Date.now();
          if (now - seekedToast.current > 3000) {
            seekedToast.current = now;
            toast("You can't skip ahead — only rewind is allowed.");
          }
        }
      }}
      className="aspect-video w-full rounded-md bg-black"
    />
  );
}

function VideoPlayer({ path, url }: { path?: string; url?: string }) {
  const signed = useSignedUrl("course-content", path);

  // Prefer pasted link if present
  if (url && url.trim()) {
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      return (
        <EmptyMedia label="This video link isn't supported. Edit the lesson and paste a YouTube, Vimeo, Loom, Drive, or .mp4 URL." />
      );
    }
    if (parsed.provider === "direct") {
      return <NoSeekVideo src={parsed.embedUrl} />;
    }
    return (
      <iframe
        key={parsed.embedUrl}
        src={parsed.embedUrl}
        className="aspect-video w-full rounded-md border bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Lesson video"
      />
    );
  }

  if (!path) return <EmptyMedia label="No video added yet" />;
  if (!signed) return <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />;
  return <NoSeekVideo src={signed} />;
}

function PdfViewer({ path }: { path?: string }) {
  const url = useSignedUrl("course-content", path);
  if (!path) return <EmptyMedia label="No PDF uploaded" />;
  if (!url) return <div className="h-[60vh] w-full animate-pulse rounded-md bg-muted" />;
  return (
    <div className="space-y-2">
      <iframe src={url} title="PDF" className="h-[60vh] w-full rounded-md border bg-white" />
      <Button asChild size="sm" variant="outline">
        <a href={url} target="_blank" rel="noreferrer">
          <Download className="h-4 w-4" /> Open in new tab
        </a>
      </Button>
    </div>
  );
}

function EmptyMedia({ label }: { label: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center rounded-md border bg-muted/40 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

type QuizQuestion = {
  id: string;
  type: "mcq" | "tf" | "short";
  prompt: string;
  options?: string[];
  answer: number | string;
};

function QuizRunner({
  content,
  onPass,
  done,
}: {
  content: any;
  onPass: () => void;
  done: boolean;
}) {
  const questions: QuizQuestion[] = content?.questions ?? [];
  const passing = content?.passing_score ?? 70;
  const [answers, setAnswers] = React.useState<Record<string, string | number>>({});
  const [result, setResult] = React.useState<{ score: number; passed: boolean } | null>(null);

  function submit() {
    if (questions.length === 0) {
      toast.error("This quiz has no questions yet");
      return;
    }
    let correct = 0;
    for (const q of questions) {
      const a = answers[q.id];
      if (q.type === "mcq" && typeof q.answer === "number" && Number(a) === q.answer) correct++;
      else if (q.type === "tf" && String(a) === String(q.answer)) correct++;
      else if (
        q.type === "short" &&
        typeof a === "string" &&
        a.trim().toLowerCase() === String(q.answer).trim().toLowerCase()
      )
        correct++;
    }
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= passing;
    setResult({ score, passed });
    if (passed) onPass();
  }

  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">No questions in this quiz yet.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Passing score: {passing}%</p>
      {questions.map((q, idx) => (
        <div key={q.id} className="space-y-2 rounded-md border bg-muted/30 p-3">
          <p className="text-sm font-medium">
            Q{idx + 1}. {q.prompt || <span className="text-muted-foreground">(no prompt)</span>}
          </p>
          {q.type === "mcq" && (
            <div className="space-y-1">
              {(q.options ?? []).map((opt, i) => (
                <label key={i} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={Number(answers[q.id]) === i}
                    onChange={() => setAnswers({ ...answers, [q.id]: i })}
                  />
                  {opt || <span className="text-muted-foreground">Option {i + 1}</span>}
                </label>
              ))}
            </div>
          )}
          {q.type === "tf" && (
            <div className="flex gap-4 text-sm">
              {["true", "false"].map((v) => (
                <label key={v} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`q-${q.id}`}
                    checked={answers[q.id] === v}
                    onChange={() => setAnswers({ ...answers, [q.id]: v })}
                  />
                  {v}
                </label>
              ))}
            </div>
          )}
          {q.type === "short" && (
            <Input
              placeholder="Your answer"
              value={String(answers[q.id] ?? "")}
              onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
            />
          )}
        </div>
      ))}
      {result && (
        <div
          className={`rounded-md border p-3 text-sm ${result.passed ? "border-primary/40 bg-primary/10" : "border-destructive/40 bg-destructive/10"}`}
        >
          Score: {result.score}% — {result.passed ? "Passed 🎉" : "Try again to pass"}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setAnswers({});
            setResult(null);
          }}
        >
          Reset
        </Button>
        <Button size="sm" onClick={submit} disabled={done}>
          {done ? "Already passed" : "Submit answers"}
        </Button>
      </div>
    </div>
  );
}

function PracticalSubmit({
  lessonId,
  brief,
  userId,
  onSubmitted,
}: {
  lessonId: string;
  brief?: string;
  userId: string;
  onSubmitted: () => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [submission, setSubmission] = React.useState<{
    id: string;
    status: string;
    file_url: string;
    feedback: string | null;
    grade: number | null;
  } | null>(null);
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id,status,file_url,feedback,grade")
        .eq("lesson_id", lessonId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubmission(data ?? null);
    })();
  }, [lessonId, userId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/${lessonId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("submissions")
      .upload(path, file, { contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { data: ins, error: insErr } = await supabase
      .from("submissions")
      .insert({
        lesson_id: lessonId,
        user_id: userId,
        file_url: path,
        feedback: note || null,
        status: "pending",
      })
      .select("id,status,file_url,feedback,grade")
      .single();
    setUploading(false);
    if (insErr) {
      toast.error(insErr.message);
      return;
    }
    setSubmission(ins);
    setNote("");
    toast.success("Submitted for review");
    onSubmitted();
  }

  return (
    <div className="space-y-3">
      {brief ? (
        <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
          {brief}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No brief provided.</p>
      )}

      {submission ? (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">Last submission</span>
            <Badge
              variant={
                submission.status === "approved"
                  ? "default"
                  : submission.status === "revision"
                    ? "destructive"
                    : "secondary"
              }
            >
              {submission.status}
            </Badge>
          </div>
          {submission.grade !== null && (
            <p className="text-xs text-muted-foreground">Grade: {submission.grade}</p>
          )}
          {submission.feedback && (
            <p className="text-xs text-muted-foreground">Feedback: {submission.feedback}</p>
          )}
        </div>
      ) : null}

      <Textarea
        rows={2}
        placeholder="Optional note to your reviewer"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div>
        <label className="inline-flex">
          <input
            type="file"
            className="hidden"
            id={`upload-${lessonId}`}
            onChange={handleUpload}
            disabled={uploading}
          />
          <Button asChild size="sm" disabled={uploading}>
            <label htmlFor={`upload-${lessonId}`} className="cursor-pointer">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : submission ? "Resubmit" : "Upload submission"}
            </label>
          </Button>
        </label>
      </div>
    </div>
  );
}
