import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink, Loader2, Sparkles } from "lucide-react";
import { reviewSubmission } from "@/server/review-submission";

export type LessonSubmission = {
  id: string;
  status: "pending" | "approved" | "revision";
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
};

type LetterGrade = "A+" | "A" | "B" | "C";
const LETTER_GRADE_MAP: Record<LetterGrade, { numeric: number; status: "approved" | "revision"; label: string }> = {
  "A+": { numeric: 90, status: "approved", label: "A+ — Exceptional (90%)" },
  A: { numeric: 85, status: "approved", label: "A — Strong pass (85%)" },
  B: { numeric: 75, status: "approved", label: "B — Pass (75%)" },
  C: { numeric: 0, status: "revision", label: "C — Redo required" },
};

export function LessonReviewDialog({
  row,
  reviewerId,
  onClose,
  onSaved,
}: {
  row: LessonSubmission | null;
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
                            s >= 88 ? "A+" : s >= 80 ? "A" : s >= 70 ? "B" : "C";
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
