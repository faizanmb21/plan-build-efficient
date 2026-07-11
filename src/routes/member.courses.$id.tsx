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
  Lock,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { parseVideoUrl } from "@/lib/video-embed";
import { YouTubeEmbed } from "@/components/YouTubeEmbed";


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

type QuizQuestion = {
  id: string;
  type: "mcq" | "tf" | "short";
  prompt: string;
  options?: string[];
  answer: number | string;
};

/** Flat optional bag — content shape varies by lesson type and all access uses optional chaining */
type LessonContent = {
  // video / pdf
  path?: string;
  url?: string;
  // quiz
  questions?: QuizQuestion[];
  passing_score?: number;
  // practical
  brief?: string;
  assignment?: {
    brief: string;
    attachment_path?: string | null;
    attachment_name?: string | null;
  };
};
type QuizContent = { questions: QuizQuestion[]; passing_score?: number };

type Lesson = {
  id: string;
  title: string;
  type: LessonType;
  position: number;
  content: LessonContent;
  section_id: string;
  requires_submission: boolean;
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
  const [nextCourse, setNextCourse] = React.useState<{ id: string; title: string } | null>(null);

  const allLessons = React.useMemo(() => sections.flatMap((s) => s.lessons), [sections]);
  const activeLesson = allLessons.find((l) => l.id === activeLessonId) ?? null;
  const completedCount = Object.values(progress).filter((p) => p.completed).length;
  const totalCount = allLessons.length;
  const pct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const isComplete = totalCount > 0 && pct === 100;

  // First incomplete lesson — everything AFTER it is locked.
  const firstIncompleteIdx = React.useMemo(
    () => allLessons.findIndex((l) => !progress[l.id]?.completed),
    [allLessons, progress],
  );
  const isLessonLocked = React.useCallback(
    (lessonId: string) => {
      if (firstIncompleteIdx < 0) return false; // course fully complete
      const idx = allLessons.findIndex((l) => l.id === lessonId);
      return idx > firstIncompleteIdx;
    },
    [allLessons, firstIncompleteIdx],
  );
  const activeLocked = activeLesson ? isLessonLocked(activeLesson.id) : false;
  const blockingLesson = activeLocked ? allLessons[firstIncompleteIdx] : null;

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
          .select("id,title,type,position,content,section_id,requires_submission")
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

  // When this course is complete, find the next assigned course to recommend.
  React.useEffect(() => {
    if (!user || !isComplete) return;
    (async () => {
      const { data: aData } = await supabase
        .from("assignments")
        .select("course_id,courses(id,title)")
        .eq("user_id", user.id);
      const others = ((aData ?? []) as Array<{
        course_id: string;
        courses: { id: string; title: string } | null;
      }>).filter((a) => a.course_id !== courseId && a.courses);
      if (others.length === 0) {
        setNextCourse(null);
        return;
      }
      // Pick the first one that isn't fully completed yet.
      const courseIds = others.map((o) => o.course_id);
      const { data: secs } = await supabase
        .from("sections")
        .select("id,course_id")
        .in("course_id", courseIds);
      const sectionToCourse = new Map((secs ?? []).map((s) => [s.id, s.course_id]));
      const sectionIds = (secs ?? []).map((s) => s.id);
      const { data: lessons } = sectionIds.length
        ? await supabase.from("lessons").select("id,section_id").in("section_id", sectionIds)
        : { data: [] as { id: string; section_id: string }[] };
      const totals: Record<string, number> = {};
      const lessonToCourse = new Map<string, string>();
      for (const l of lessons ?? []) {
        const cid = sectionToCourse.get(l.section_id)!;
        lessonToCourse.set(l.id, cid);
        totals[cid] = (totals[cid] ?? 0) + 1;
      }
      const lessonIds = Array.from(lessonToCourse.keys());
      const { data: prog } = lessonIds.length
        ? await supabase
            .from("lesson_progress")
            .select("lesson_id,completed")
            .eq("user_id", user.id)
            .in("lesson_id", lessonIds)
        : { data: [] as { lesson_id: string; completed: boolean }[] };
      const dones: Record<string, number> = {};
      for (const p of prog ?? []) {
        if (!p.completed) continue;
        const cid = lessonToCourse.get(p.lesson_id);
        if (cid) dones[cid] = (dones[cid] ?? 0) + 1;
      }
      const pick =
        others.find((o) => (dones[o.course_id] ?? 0) < (totals[o.course_id] ?? 0)) ??
        others[0];
      setNextCourse(pick?.courses ?? null);
    })();
  }, [user, isComplete, courseId]);

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

  // Pause any playing media (HTML <video> or YouTube/Vimeo iframe) inside the
  const lessonAreaRef = React.useRef<HTMLDivElement | null>(null);

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

      {isComplete && (
        <Card className="overflow-hidden border-primary/30 bg-primary/5">
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="text-3xl">🎉</div>
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Course complete!
                </h2>
                <p className="text-sm text-muted-foreground">
                  You finished every lesson in {course?.title}. Nice work.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {nextCourse ? (
                <Button asChild>
                  <Link to="/member/courses/$id" params={{ id: nextCourse.id }}>
                    Continue with {nextCourse.title} →
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link to="/member">Back to dashboard</Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div ref={lessonAreaRef} className="order-2 lg:order-1">
          {activeLesson ? (
            activeLocked ? (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="space-y-3 p-6 text-center">
                  <Lock className="mx-auto h-8 w-8 text-amber-600" />
                  <h2 className="text-lg font-semibold">Lesson locked</h2>
                  <p className="text-sm text-muted-foreground">
                    Finish{" "}
                    <span className="font-medium text-foreground">
                      {blockingLesson?.title}
                    </span>{" "}
                    first to unlock this lesson.
                    {blockingLesson?.type === "practical" ||
                    (blockingLesson?.requires_submission &&
                      !!(
                        blockingLesson?.content?.assignment?.brief ||
                        blockingLesson?.content?.assignment?.attachment_path
                      ))
                      ? " Upload your submission there to move on."
                      : ""}
                  </p>
                  {blockingLesson && (
                    <Button
                      size="sm"
                      onClick={() => setActiveLessonId(blockingLesson.id)}
                    >
                      Go to {blockingLesson.title}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <LessonView
                lesson={activeLesson}
                done={!!progress[activeLesson.id]?.completed}
                onComplete={() => markCompleted(activeLesson.id)}
                onSubmissionSaved={() => load()}
                userId={user?.id ?? ""}
              />
            )
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
                    const locked = isLessonLocked(l.id);
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => {
                            if (locked) {
                              toast("🔒 Finish the previous lesson first.");
                              return;
                            }
                            setActiveLessonId(l.id);
                          }}
                          aria-disabled={locked}
                          title={locked ? "Locked — finish the previous lesson first" : undefined}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                            active
                              ? "bg-primary/10 text-foreground"
                              : locked
                                ? "cursor-not-allowed text-muted-foreground/50"
                                : "hover:bg-muted text-muted-foreground"
                          }`}
                        >
                          {locked ? (
                            <Lock className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                          ) : done ? (
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
  onComplete: () => void | Promise<void>;
  onSubmissionSaved: () => void;
  userId: string;
}) {
  const [mediaOpened, setMediaOpened] = React.useState(false);

  // Reset media-opened gate whenever the lesson changes
  React.useEffect(() => { setMediaOpened(false); }, [lesson.id]);

  // Failsafe: play-detection can miss on exotic embeds (cross-origin iframes
  // swallow clicks; provider APIs can fail to load). After 45s on the lesson,
  // enable completion anyway — the gate is an anti-instant-skip nudge, and a
  // member must NEVER be permanently stuck on a video they actually watched.
  React.useEffect(() => {
    if (done || mediaOpened) return;
    if (lesson.type !== "video" && lesson.type !== "pdf") return;
    const t = window.setTimeout(() => setMediaOpened(true), 45_000);
    return () => window.clearTimeout(t);
  }, [lesson.id, lesson.type, done, mediaOpened]);

  const requiresSub = lesson.requires_submission;
  // An assignment is attached when the lesson content carries a brief or an
  // attachment file.
  const hasAssignment =
    (lesson.type === "video" || lesson.type === "pdf" || lesson.type === "quiz") &&
    !!(lesson.content?.assignment?.brief || lesson.content?.assignment?.attachment_path);
  // Two kinds of "mandatory":
  // 1. Mandatory watch (toggle on, NO assignment attached): the member must
  //    watch in order — completion is the normal watch → mark-complete flow.
  //    No upload is demanded.
  // 2. Mandatory assignment (assignment attached + toggle on): the member
  //    must SUBMIT the assignment before the next lesson unlocks.
  const uploadRequired = requiresSub && hasAssignment;

  // For submission-gated lessons, PracticalSubmit tracks whether a submission exists.
  // We lift that state here so the "Mark complete" gate can read it.
  const [hasSubmission, setHasSubmission] = React.useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{lesson.title}</CardTitle>
          <Badge variant={done ? "default" : "secondary"}>{done ? "Completed" : lesson.type}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {(uploadRequired || lesson.type === "practical") && !done && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-foreground">
                Submission required to unlock the next lesson
              </p>
              <p className="text-muted-foreground">
                {lesson.type === "practical"
                  ? "Complete the practical below and upload your work. The next lesson unlocks once you've submitted."
                  : "Watch the content below, then upload your assignment work. The next lesson unlocks once you've submitted."}
              </p>
            </div>
          </div>
        )}

        {/* Video / PDF / Quiz content */}
        {lesson.type === "video" && (
          <VideoPlayer
            path={lesson.content?.path}
            url={lesson.content?.url}
            onPlay={() => setMediaOpened(true)}
          />
        )}
        {lesson.type === "pdf" && (
          <PdfViewer path={lesson.content?.path} onView={() => setMediaOpened(true)} />
        )}
        {lesson.type === "quiz" && (
          <QuizRunner
            content={{ questions: lesson.content.questions ?? [], passing_score: lesson.content.passing_score }}
            onPass={uploadRequired ? () => {} : onComplete}
            done={done}
          />
        )}

        {/* Practical type */}
        {lesson.type === "practical" && (
          <PracticalSubmit
            lessonId={lesson.id}
            brief={lesson.content?.brief}
            userId={userId}
            onSubmitted={() => {
              setHasSubmission(true);
              onSubmissionSaved();
            }}
            onSubmissionLoaded={(exists) => setHasSubmission(exists)}
          />
        )}

        {/* Assignment upload area — shown whenever an assignment is attached.
            Blocking only when the mandatory toggle is also on. */}
        {hasAssignment && lesson.type !== "practical" && (
          <div className="space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
            <p className="text-sm font-semibold">
              📋 Assignment{uploadRequired ? "" : " (optional)"}
            </p>
            <PracticalSubmit
              lessonId={lesson.id}
              brief={lesson.content?.assignment?.brief ?? ""}
              attachmentPath={lesson.content?.assignment?.attachment_path ?? null}
              attachmentName={lesson.content?.assignment?.attachment_name ?? null}
              userId={userId}
              onSubmitted={async () => {
                setHasSubmission(true);
                // For a mandatory assignment, submitting IS what unlocks the
                // next lesson — complete automatically so the member is never
                // stuck in a submit → "Resubmit" loop.
                if (uploadRequired && !done) await Promise.resolve(onComplete());
                onSubmissionSaved();
              }}
              onSubmissionLoaded={(exists) => setHasSubmission(exists)}
            />
          </div>
        )}

        {/* Mandatory assignment: completion is gated on having a submission.
            Auto-completed on upload above; this button unsticks members who
            submitted before that fix shipped. */}
        {uploadRequired && lesson.type !== "practical" && !done && (
          <div className="flex items-center justify-end gap-2">
            {!hasSubmission && (
              <p className="text-xs text-muted-foreground">
                Upload your assignment work above to complete this lesson
              </p>
            )}
            <Button onClick={onComplete} disabled={!hasSubmission} size="sm">
              Mark as completed
            </Button>
          </div>
        )}

        {/* Watch-to-complete — video/pdf lessons without a mandatory
            assignment (including mandatory-watch lessons with no assignment
            attached). */}
        {!uploadRequired && (lesson.type === "video" || lesson.type === "pdf") && (
          <div className="flex items-center justify-end gap-2">
            {!done && !mediaOpened && (
              <p className="text-xs text-muted-foreground">Open the {lesson.type} above to enable completion</p>
            )}
            <Button onClick={onComplete} disabled={done || !mediaOpened} size="sm">
              {done ? "Completed" : "Mark as completed"}
            </Button>
          </div>
        )}

        {/* Practical: "Mark complete" enabled only after submission uploaded */}
        {lesson.type === "practical" && !done && (
          <div className="flex items-center justify-end gap-2">
            {!hasSubmission && (
              <p className="text-xs text-muted-foreground">Upload your work above to complete this lesson</p>
            )}
            <Button onClick={onComplete} disabled={!hasSubmission} size="sm">
              Mark as completed
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
function NoSeekVideo({ src, onPlay }: { src: string; onPlay?: () => void }) {
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
      onPlay={onPlay}
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

/**
 * Detects the user clicking INTO a cross-origin iframe. Click events inside
 * an iframe never bubble to this document, so a wrapper onClick can't see
 * them — but when focus moves into the iframe, the window fires `blur` with
 * document.activeElement set to that iframe. That's the reliable signal.
 */
function useIframeEngagement(
  wrapRef: React.RefObject<HTMLElement | null>,
  onEngage?: () => void,
) {
  const cbRef = React.useRef(onEngage);
  cbRef.current = onEngage;
  React.useEffect(() => {
    const onBlur = () => {
      const el = document.activeElement;
      if (el && el.tagName === "IFRAME" && wrapRef.current?.contains(el)) {
        cbRef.current?.();
      }
    };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [wrapRef]);
}

function EmbedVideo({ embedUrl, onPlay }: { embedUrl: string; onPlay?: () => void }) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  useIframeEngagement(wrapRef, onPlay);
  return (
    <div ref={wrapRef} onClick={onPlay}>
      <iframe
        key={embedUrl}
        src={embedUrl}
        className="aspect-video w-full rounded-md border bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title="Lesson video"
      />
    </div>
  );
}

function VideoPlayer({ path, url, onPlay }: { path?: string; url?: string; onPlay?: () => void }) {
  const signed = useSignedUrl("course-content", path);

  // Prefer pasted link if present
  if (url && url.trim()) {
    const parsed = parseVideoUrl(url);
    if (!parsed) {
      // Unknown link type — never a dead end. Let the member open it in a
      // new tab, which also counts as opening the lesson media.
      const href = url.trim().match(/https?:\/\/\S+/)?.[0];
      if (href) {
        return (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-md border bg-muted/40 p-6 text-center">
            <ExternalLink className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              This lesson's content opens outside the player.
            </p>
            <Button asChild size="lg">
              <a href={href} target="_blank" rel="noreferrer" onClick={onPlay}>
                Open lesson content <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        );
      }
      return (
        <EmptyMedia label="This video link isn't supported. Edit the lesson and paste a YouTube, Vimeo, Loom, Drive, or .mp4 URL." />
      );
    }
    if (parsed.provider === "direct") {
      return <NoSeekVideo src={parsed.embedUrl} onPlay={onPlay} />;
    }
    if (parsed.provider === "youtube") {
      return <YouTubeEmbed embedUrl={parsed.embedUrl} originalUrl={parsed.originalUrl} onPlay={onPlay} />;
    }
    // Other embed providers (Vimeo, Loom, Drive) — clicking into the iframe
    // counts as opening the video (window-blur focus trick).
    return <EmbedVideo embedUrl={parsed.embedUrl} onPlay={onPlay} />;
  }

  if (!path) return <EmptyMedia label="No video added yet" />;
  if (!signed) return <div className="aspect-video w-full animate-pulse rounded-md bg-muted" />;
  return <NoSeekVideo src={signed} onPlay={onPlay} />;
}

function PdfViewer({ path, onView }: { path?: string; onView?: () => void }) {
  const url = useSignedUrl("course-content", path);
  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  useIframeEngagement(wrapRef, onView);
  if (!path) return <EmptyMedia label="No PDF uploaded" />;
  if (!url) return <div className="h-[60vh] w-full animate-pulse rounded-md bg-muted" />;
  return (
    <div ref={wrapRef} className="space-y-2" onClick={onView}>
      <iframe src={url} title="PDF" className="h-[60vh] w-full rounded-md border bg-white" />
      <Button asChild size="sm" variant="outline">
        <a href={url} target="_blank" rel="noreferrer" onClick={onView}>
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

function QuizRunner({
  content,
  onPass,
  done,
}: {
  content: QuizContent;
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
  attachmentPath,
  attachmentName,
  userId,
  onSubmitted,
  onSubmissionLoaded,
}: {
  lessonId: string;
  brief?: string;
  attachmentPath?: string | null;
  attachmentName?: string | null;
  userId: string;
  onSubmitted: () => void;
  onSubmissionLoaded?: (exists: boolean) => void;
}) {
  const [uploading, setUploading] = React.useState(false);
  const [submission, setSubmission] = React.useState<{
    id: string;
    status: string;
    file_url: string;
    feedback: string | null;
    grade: number | null;
    letter_grade: string | null;
  } | null>(null);
  const [note, setNote] = React.useState("");
  const [attachmentUrl, setAttachmentUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id,status,file_url,feedback,grade,letter_grade")
        .eq("lesson_id", lessonId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubmission(data ?? null);
      onSubmissionLoaded?.(!!data);
    })();
  }, [lessonId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!attachmentPath) {
      setAttachmentUrl(null);
      return;
    }
    (async () => {
      const { data } = await supabase.storage
        .from("course-content")
        .createSignedUrl(attachmentPath, 3600);
      setAttachmentUrl(data?.signedUrl ?? null);
    })();
  }, [attachmentPath]);

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
      .select("id,status,file_url,feedback,grade,letter_grade")
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

      {attachmentPath && (
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="outline">
            <a
              href={attachmentUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              download={attachmentName ?? undefined}
            >
              <FileText className="h-4 w-4" />
              Download brief attachment{attachmentName ? ` — ${attachmentName}` : ""}
            </a>
          </Button>
        </div>
      )}

      {submission ? (
        <div className="space-y-2 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium">Last submission</span>
            <div className="flex items-center gap-2">
              {submission.letter_grade && (
                <Badge variant="outline" className="font-mono">
                  {submission.letter_grade}
                </Badge>
              )}
              <Badge
                variant={
                  submission.status === "approved"
                    ? "default"
                    : submission.status === "revision"
                      ? "destructive"
                      : "secondary"
                }
              >
                {submission.status === "revision" ? "Redo required" : submission.status}
              </Badge>
            </div>
          </div>
          {submission.letter_grade && (
            <p className="text-xs text-muted-foreground">
              {submission.status === "revision"
                ? "Your reviewer asked for a redo — upload a new submission below."
                : `Passed with grade ${submission.letter_grade}${submission.grade !== null ? ` (${submission.grade}%)` : ""}.`}
            </p>
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
