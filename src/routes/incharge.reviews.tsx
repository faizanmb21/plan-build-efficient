import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, Clock, RefreshCcw, FileText, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { reviewSubmission } from "@/server/review-submission";

export const Route = createFileRoute("/incharge/reviews")({
  component: ReviewsPage,
});

type SubmissionStatus = "pending" | "approved" | "revision";

interface SubmissionRow {
  id: string;
  status: SubmissionStatus;
  file_url: string;
  grade: number | null;
  letter_grade: string | null;
  feedback: string | null;
  created_at: string;
  reviewed_at: string | null;
  user_id: string;
  lesson_id: string;
  lesson_title: string;
  course_title: string;
  member_name: string;
}

type LetterGrade = "A+" | "A" | "B" | "C";
const LETTER_GRADE_MAP: Record<LetterGrade, { numeric: number; status: SubmissionStatus; label: string }> = {
  "A+": { numeric: 100, status: "approved", label: "A+ — Exceptional (100%)" },
  A: { numeric: 80, status: "approved", label: "A — Pass (80%)" },
  B: { numeric: 60, status: "approved", label: "B — Pass (60%)" },
  C: { numeric: 0, status: "revision", label: "C — Redo required" },
};

const STATUS_META: Record<
  SubmissionStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
> = {
  pending: { label: "Pending", icon: Clock, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  approved: { label: "Approved", icon: CheckCircle2, cls: "bg-primary/15 text-primary" },
  revision: { label: "Revision", icon: RefreshCcw, cls: "bg-destructive/15 text-destructive" },
};

function ReviewsPage() {
  const { user } = useAuth();
  const [tab, setTab] = React.useState<SubmissionStatus | "all">("pending");
  const [rows, setRows] = React.useState<SubmissionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState<SubmissionRow | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data: subs, error } = await supabase
      .from("submissions")
      .select("id,status,file_url,grade,letter_grade,feedback,created_at,reviewed_at,user_id,lesson_id")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const lessonIds = Array.from(new Set((subs ?? []).map((s) => s.lesson_id)));
    const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)));

    const [{ data: lessons }, { data: profiles }] = await Promise.all([
      lessonIds.length
        ? supabase
            .from("lessons")
            .select("id,title,section_id,sections(course_id,courses(title))")
            .in("id", lessonIds)
        : Promise.resolve({ data: [] as any[] }),
      userIds.length
        ? supabase.from("profiles").select("id,full_name").in("id", userIds)
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

    const enriched: SubmissionRow[] = (subs ?? []).map((s: any) => ({
      ...s,
      status: s.status as SubmissionStatus,
      letter_grade: (s.letter_grade as string | null) ?? null,
      lesson_title: lessonMap.get(s.lesson_id)?.title ?? "Lesson",
      course_title: lessonMap.get(s.lesson_id)?.courseTitle ?? "Course",
      member_name: profileMap.get(s.user_id) ?? "Member",
    }));
    setRows(enriched);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(
    () => (tab === "all" ? rows : rows.filter((r) => r.status === tab)),
    [rows, tab],
  );

  const counts = React.useMemo(
    () => ({
      pending: rows.filter((r) => r.status === "pending").length,
      approved: rows.filter((r) => r.status === "approved").length,
      revision: rows.filter((r) => r.status === "revision").length,
      all: rows.length,
    }),
    [rows],
  );

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Grading queue</h1>
          <p className="text-sm text-muted-foreground">
            Review practical submissions from members in your franchise.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
          Refresh
        </Button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
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
      ) : filtered.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here</CardTitle>
            <CardDescription>
              {tab === "pending"
                ? "No submissions waiting for review. 🎉"
                : "No submissions match this filter."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((row) => (
            <SubmissionCard key={row.id} row={row} onOpen={() => setActive(row)} />
          ))}
        </div>
      )}

      <ReviewDialog
        row={active}
        reviewerId={user?.id ?? ""}
        onClose={() => setActive(null)}
        onSaved={() => {
          setActive(null);
          load();
        }}
      />
    </div>
  );
}

function SubmissionCard({ row, onOpen }: { row: SubmissionRow; onOpen: () => void }) {
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
              <Badge variant="outline" className="font-mono">
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

function ReviewDialog({
  row,
  reviewerId,
  onClose,
  onSaved,
}: {
  row: SubmissionRow | null;
  reviewerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [letter, setLetter] = React.useState<LetterGrade | null>(null);
  const [feedback, setFeedback] = React.useState<string>("");
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState(false);
  const [aiReview, setAiReview] = React.useState<{
    score: number;
    comments: string;
    rubric: Record<string, number>;
    model: string;
  } | null>(null);

  React.useEffect(() => {
    if (!row) return;
    setLetter((row.letter_grade as LetterGrade | null) ?? null);
    setFeedback(row.feedback ?? "");
    setSignedUrl(null);
    setAiReview(null);
    (async () => {
      const { data } = await supabase.storage
        .from("submissions")
        .createSignedUrl(row.file_url, 60 * 30);
      setSignedUrl(data?.signedUrl ?? null);
      // Load latest existing AI review
      const { data: existing } = await supabase
        .from("ai_reviews")
        .select("score, comments, rubric, model")
        .eq("submission_id", row.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing && existing.score !== null) {
        setAiReview({
          score: existing.score,
          comments: existing.comments ?? "",
          rubric: (existing.rubric ?? {}) as Record<string, number>,
          model: existing.model,
        });
      }
    })();
  }, [row]);

  async function runAi() {
    if (!row) return;
    setAiLoading(true);
    try {
      const res = await reviewSubmission({ data: { submissionId: row.id } });
      if (!res.ok) {
        toast.error(res.error ?? "AI review failed");
      } else {
        setAiReview({
          score: res.score,
          comments: res.comments,
          rubric: res.rubric,
          model: res.model,
        });
        toast.success("AI review ready");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI review failed");
    } finally {
      setAiLoading(false);
    }
  }

  async function save() {
    if (!row) return;
    if (!letter) {
      toast.error("Pick a letter grade first");
      return;
    }
    const meta = LETTER_GRADE_MAP[letter];
    setSaving(true);
    const { error } = await (supabase as any)
      .from("submissions")
      .update({
        status: meta.status,
        grade: meta.numeric,
        letter_grade: letter,
        feedback: feedback.trim() || null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      setSaving(false);
      toast.error(error.message);
      return;
    }
    // On pass: mark lesson complete. On redo: mark lesson incomplete so member resubmits.
    if (meta.status === "approved") {
      const { error: progErr } = await supabase
        .from("lesson_progress")
        .upsert(
          {
            user_id: row.user_id,
            lesson_id: row.lesson_id,
            completed: true,
            progress_percent: 100,
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,lesson_id" },
        );
      if (progErr) console.warn("lesson_progress upsert failed:", progErr.message);
    } else if (meta.status === "revision") {
      const { error: progErr } = await supabase
        .from("lesson_progress")
        .upsert(
          {
            user_id: row.user_id,
            lesson_id: row.lesson_id,
            completed: false,
            progress_percent: 0,
            completed_at: null,
          },
          { onConflict: "user_id,lesson_id" },
        );
      if (progErr) console.warn("lesson_progress upsert failed:", progErr.message);
    }
    setSaving(false);
    toast.success(
      meta.status === "approved"
        ? `Graded ${letter} — lesson marked complete`
        : `Graded ${letter} — member must redo`,
    );
    onSaved();
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.lesson_title}</DialogTitle>
              <DialogDescription>
                {row.member_name} · {row.course_title} · Submitted{" "}
                {new Date(row.created_at).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                  Submitted file
                </p>
                {signedUrl ? (
                  <a
                    href={signedUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open submission in new tab
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">Generating preview link…</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Grade this submission</label>
                <p className="text-xs text-muted-foreground">
                  A+ / A / B = pass (lesson marked complete). C = redo (member must resubmit).
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {(Object.keys(LETTER_GRADE_MAP) as LetterGrade[]).map((g) => {
                    const meta = LETTER_GRADE_MAP[g];
                    const selected = letter === g;
                    const isRedo = meta.status === "revision";
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setLetter(g)}
                        className={`rounded-md border p-3 text-center transition-colors ${
                          selected
                            ? isRedo
                              ? "border-destructive bg-destructive/10 text-destructive"
                              : "border-primary bg-primary/10 text-primary"
                            : "hover:bg-accent"
                        }`}
                      >
                        <div className="text-lg font-bold">{g}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {isRedo ? "Redo" : `${meta.numeric}%`}
                        </div>
                      </button>
                    );
                  })}
                </div>
                {letter && (
                  <p className="text-xs text-muted-foreground">{LETTER_GRADE_MAP[letter].label}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium">Feedback</label>
                <Textarea
                  rows={4}
                  placeholder="Notes for the member…"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </div>

              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> AI review (advisory)
                  </p>
                  <Button size="sm" variant="outline" onClick={runAi} disabled={aiLoading}>
                    {aiLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {aiReview ? "Re-run" : "Run AI review"}
                  </Button>
                </div>
                {aiReview ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-primary/20 text-primary">Score {aiReview.score}/100</Badge>
                      <span className="text-xs text-muted-foreground">{aiReview.model}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto h-6 text-xs"
                        onClick={() => {
                          const s = aiReview.score;
                          const suggested: LetterGrade =
                            s >= 95 ? "A+" : s >= 75 ? "A" : s >= 55 ? "B" : "C";
                          setLetter(suggested);
                          setFeedback(aiReview.comments);
                        }}
                      >
                        Use as my review
                      </Button>
                    </div>
                    <p className="text-sm">{aiReview.comments}</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Click to get an AI-suggested score and feedback you can edit.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save review
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
