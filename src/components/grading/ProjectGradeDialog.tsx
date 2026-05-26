import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProjectReviewPanel, type ProjectSubmission } from "./ProjectReviewPanel";

export { type ProjectSubmission };

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
  if (!sub) return null;
  return (
    <Dialog open={!!sub} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review submission</DialogTitle>
          <DialogDescription>
            {memberName ?? "Member"} — submitted{" "}
            {new Date(sub.created_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>
        <ProjectReviewPanel
          sub={sub}
          memberName={memberName}
          reviewerId={reviewerId}
          onSaved={onSaved}
          compactHeader
        />
      </DialogContent>
    </Dialog>
  );
}
