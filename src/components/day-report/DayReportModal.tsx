import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, ArrowRight } from "lucide-react";
import { useWorkSession } from "@/hooks/use-work-session";
import { DayReportCard } from "./DayReportCard";

/**
 * Pops up automatically when WorkSessionProvider finishes generating today's
 * day report (after a successful clock-out). Trainees screenshot the card and
 * share it in their training WhatsApp group.
 */
export function DayReportModal() {
  const { lastDayReport, dismissDayReport } = useWorkSession();
  const open = !!lastDayReport;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismissDayReport();
      }}
    >
      <DialogContent className="max-w-md gap-3 p-0 sm:max-w-md">
        <DialogHeader className="px-5 pb-2 pt-5">
          <DialogTitle className="text-base">Your day report is ready</DialogTitle>
          <DialogDescription className="text-xs">
            Screenshot this card and share it in the training group.
          </DialogDescription>
        </DialogHeader>
        <div className="px-5 pb-4">
          {lastDayReport && <DayReportCard payload={lastDayReport} framed={false} />}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-white/10 bg-white/[0.02] px-5 py-3 text-xs">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Camera className="h-3.5 w-3.5" />
            Long-press / Cmd+Shift+4 to screenshot
          </span>
          <Button asChild size="sm" variant="ghost" onClick={dismissDayReport}>
            <Link to="/member/today">
              Open full page <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
