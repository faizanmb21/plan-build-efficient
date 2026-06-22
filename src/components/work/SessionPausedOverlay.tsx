import * as React from "react";
import { Button } from "@/components/ui/button";
import { useWorkSession } from "@/hooks/use-work-session";
import { PauseCircle, Play } from "lucide-react";

export function SessionPausedOverlay() {
  const { pausedReason, dismissPaused, start, isClockingIn } = useWorkSession();
  if (!pausedReason) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm">
      <div className="max-w-md rounded-xl border border-amber-500/30 bg-card p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <PauseCircle className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          Looks like you stepped away
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Please stay focused — your session has been paused. Clock back in when you're ready.
        </p>
        <p className="mt-3 text-xs text-muted-foreground/80">
          {pausedReason === "auto_idle_course"
            ? "No scroll or click activity on the course page for 3 minutes."
            : "No mouse or keyboard activity for 3 minutes."}
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            onClick={async () => {
              await start();
              dismissPaused();
            }}
            disabled={isClockingIn}
            size="lg"
            className="gap-2"
          >
            <Play className="h-4 w-4" /> Clock back in
          </Button>
          <Button variant="ghost" onClick={dismissPaused} size="sm">
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}
