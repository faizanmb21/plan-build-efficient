import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { ExternalLink, Loader2 } from "lucide-react";
import { type LetterGrade } from "@/lib/grade-utils";
import { getSignedSubmissionUrl } from "@/lib/project-utils";

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
  "A+": { numeric: 100, status: "approved" },
  A: { numeric: 80, status: "approved" },
  B: { numeric: 60, status: "approved" },
  C: { numeric: 0, status: "revision" },
};

export function ProjectGradeDialog({
  sub,
  memberName,
  reviewerId,
  onClose,
  onSaved,
}: {
  sub: ProjectSubmission | null;
  memberName: string | null;
  reviewerId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [letter, setLetter] = React.useState<LetterGrade | null>(null);
  const [feedback, setFeedback] = React.useState("");
  const [signedUrl, setSignedUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!sub) return;
    setLetter((sub.letter_grade as LetterGrade) ?? null);
    setFeedback(sub.feedback ?? "");
    getSignedSubmissionUrl(sub.file_url).then(setSignedUrl);
  }, [sub]);

  async function save() {
    if (!sub || !letter) {
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

  if (!sub) return null;

  return (
    <Dialog open={!!sub} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Review submission</DialogTitle>
          <DialogDescription>
            {memberName ?? "Member"} — submitted{" "}
            {new Date(sub.created_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
            >
              Open submitted file <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <div className="space-y-2">
            <Label>Letter grade</Label>
            <div className="flex gap-2">
              {(["A+", "A", "B", "C"] as LetterGrade[]).map((l) => (
                <Button
                  key={l}
                  type="button"
                  variant={letter === l ? "default" : "outline"}
                  onClick={() => setLetter(l)}
                  className="flex-1 font-mono"
                >
                  {l}
                </Button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              C = redo required; member can resubmit.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Feedback</Label>
            <Textarea
              rows={4}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What worked, what to fix…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save grade
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
