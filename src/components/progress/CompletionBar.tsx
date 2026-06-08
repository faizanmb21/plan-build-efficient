import { completionColor } from "@/lib/member-progress";
import { cn } from "@/lib/utils";

interface Props {
  value: number;
  className?: string;
  showLabel?: boolean;
}

export function CompletionBar({ value, className, showLabel = true }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const color = completionColor(v);
  const barClass =
    color === "green"
      ? "bg-emerald-500"
      : color === "amber"
        ? "bg-amber-500"
        : "bg-rose-500";
  const textClass =
    color === "green"
      ? "text-emerald-400"
      : color === "amber"
        ? "text-amber-400"
        : "text-rose-400";
  return (
    <div className={cn("flex items-center gap-2 min-w-[120px]", className)}>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
        <div
          className={cn("h-full rounded-full transition-all", barClass)}
          style={{ width: `${v}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn("w-9 text-right text-xs font-medium tabular-nums", textClass)}>
          {v}%
        </span>
      )}
    </div>
  );
}
