import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { type LetterGrade } from "@/lib/grade-utils";
import { SubmissionFilePreview } from "./SubmissionFilePreview";

export type ProjectSubmission = {
  id: string;
  project_id: string;
  user_id: string;
  file_url: string;
  status: "pending" | "approved" | "revision";
  letter_grade: string | null;
  grade: number | null;
  feedback: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const LETTER_MAP: Record<LetterGrade, { numeric: number; status: "approved" | "revision" }> = {
  "A+": { numeric: 90, status: "approved" },
  A: { numeric: 85, status: "approved" },
  B: { numeric: 75, status: "approved" },
  C: { numeric: 0, status: "revision" },
};

export function ProjectReviewPanel({
  sub,
  memberName,
  projectTitle,
  reviewerId,
  onSaved,
  showPreview = true,
  compactHeader = false,
}: {
  sub: ProjectSubmission;
  memberName: string | null;
  projectTitle?: string | null;
  reviewerId: string;
  onSaved: () => void;
  showPreview?: boolean;
  compactHeader?: boolean;
}) {
  const [letter, setLetter] = React.useState<LetterGrade | null>(
    (sub.letter_grade as LetterGrade | null) ?? null,
  );
  const [feedback, setFeedback] = React.useState(sub.feedback ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setLetter((sub.letter_grade as LetterGrade | null) ?? null);
    setFeedback(sub.feedback ?? "");
  }, [sub.id, sub.letter_grade, sub.feedback]);

  async function save() {
    if (!letter) {
      toast.error("Pick a letter grade");
      return;
    }
    const meta = LETTER_MAP[letter];
    setSaving(true);
    const { error } = await supabase
      .from("project_submissions")
      .update({
        status: meta.status,
        letter_grade: letter,
        grade: meta.numeric,
        feedback: feedback.trim() || null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", sub.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Grade saved");
    onSaved();
  }

  return (
    <div className="space-y-4">
      {!compactHeader && (
        <div>
          <h3 className="text-lg font-semibold leading-tight">
            {projectTitle ?? "Project submission"}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {memberName ?? "Member"} · Submitted {new Date(sub.created_at).toLocaleString()}
          </p>
        </div>
      )}

      {showPreview && <SubmissionFilePreview filePath={sub.file_url} />}

      <div className="space-y-2">
        <Label>Letter grade</Label>
        <div className="grid grid-cols-4 gap-2">
          {(["A+", "A", "B", "C"] as LetterGrade[]).map((l) => {
            const isRedo = l === "C";
            const selected = letter === l;
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLetter(l)}
                className={`rounded-md border p-3 text-center transition-colors ${
                  selected
                    ? isRedo
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary/10 text-primary"
                    : "hover:bg-accent"
                }`}
              >
                <div className="text-lg font-bold">{l}</div>
                <div className="text-[10px] text-muted-foreground">
                  {isRedo ? "Redo" : `${LETTER_MAP[l].numeric}%`}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          C = redo required; member can resubmit.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Feedback</Label>
        <Textarea
          rows={4}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="What worked, what to fix…"
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save grade
        </Button>
      </div>
    </div>
  );
}
