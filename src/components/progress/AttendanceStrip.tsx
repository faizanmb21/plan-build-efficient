import { type DayCell, dayStateColor, dayStateLabel } from "@/lib/attendance-utils";
import { cn } from "@/lib/utils";

export function AttendanceStrip({ cells }: { cells: DayCell[] }) {
  return (
    <div className="flex items-end gap-1">
      {cells.map((c) => (
        <div key={c.date} className="flex flex-col items-center gap-1" title={`${c.date} • ${dayStateLabel(c.state)}${c.firstStart ? ` • first ${new Date(c.firstStart).toLocaleTimeString()}` : ""}`}>
          <div className={cn("h-8 w-5 rounded-sm", dayStateColor(c.state))} />
          <span className="text-[10px] text-muted-foreground">{c.dow[0]}</span>
        </div>
      ))}
    </div>
  );
}
