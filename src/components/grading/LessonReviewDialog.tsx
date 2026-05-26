import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LessonReviewPanel, type LessonSubmission } from "./LessonReviewPanel";

export { type LessonSubmission };

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
  return (
    <Dialog open={!!row} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        {row && (
          <>
            <DialogHeader>
              <DialogTitle>{row.lesson_title}</DialogTitle>
              <DialogDescription>
                {row.member_name} · {row.course_title} · Submitted{" "}
                {new Date(row.created_at).toLocaleString()}
              </DialogDescription>
            </DialogHeader>
            <LessonReviewPanel
              row={row}
              reviewerId={reviewerId}
              onSaved={onSaved}
              compactHeader
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
