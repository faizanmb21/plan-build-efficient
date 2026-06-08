import { Badge } from "@/components/ui/badge";
import { type ProgressStatus, statusBadgeClass, statusLabel } from "@/lib/member-progress";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: ProgressStatus }) {
  return (
    <Badge variant="outline" className={cn("border", statusBadgeClass(status))}>
      {statusLabel(status)}
    </Badge>
  );
}
