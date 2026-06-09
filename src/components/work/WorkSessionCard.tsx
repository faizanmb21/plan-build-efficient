import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkSession } from "@/hooks/use-work-session";
import { Play, Square, Clock, Sparkles, Loader2, Pause, PlayCircle } from "lucide-react";

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WorkSessionCard() {
  const {
    isClockedIn,
    isPaused,
    startedAt,
    activeSeconds,
    start,
    stop,
    pause,
    resume,
    isClockingIn,
    isClockingOut,
    isPausing,
    lastSummary,
  } = useWorkSession();

  // Live tick — only when actively running
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!isClockedIn || isPaused) return;
    const t = window.setInterval(force, 1000);
    return () => window.clearInterval(t);
  }, [isClockedIn, isPaused]);

  const elapsedSec =
    isClockedIn && startedAt && !isPaused ? Math.floor((Date.now() - startedAt) / 1000) : 0;

  return (
    <Card className={isPaused ? "border-amber-500/40" : "border-primary/30"}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Work session
            </CardTitle>
            <CardDescription>
              {isPaused
                ? "Paused — timer frozen, idle checks suspended."
                : isClockedIn
                  ? "Your focused time is being recorded."
                  : "Start your work session when you sit down to learn."}
            </CardDescription>
          </div>
          {isClockedIn && !isPaused && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live
            </Badge>
          )}
          {isPaused && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-300">
              <Pause className="mr-1 h-3 w-3" />
              Paused
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Elapsed" value={fmt(elapsedSec)} muted={isPaused} />
          <Stat label="Active" value={fmt(activeSeconds)} muted={isPaused} />
        </div>

        <div className="flex flex-wrap gap-2">
          {!isClockedIn ? (
            <Button onClick={start} disabled={isClockingIn} className="gap-2">
              {isClockingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start work
            </Button>
          ) : (
            <>
              {isPaused ? (
                <Button onClick={resume} disabled={isPausing} variant="default" className="gap-2">
                  {isPausing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4" />
                  )}
                  Resume
                </Button>
              ) : (
                <Button onClick={pause} disabled={isPausing} variant="secondary" className="gap-2">
                  {isPausing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Pause className="h-4 w-4" />
                  )}
                  Pause
                </Button>
              )}
              <Button
                onClick={() => stop("manual")}
                variant="destructive"
                disabled={isClockingOut}
                className="gap-2"
              >
                {isClockingOut ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                Clock out
              </Button>
            </>
          )}
        </div>

        {!isClockedIn && (
          <p className="text-xs text-muted-foreground">
            Auto clock-out: 2 min idle on a course page, or 3 min idle anywhere in the app. You'll
            get a 30-second warning before being clocked out.
          </p>
        )}

        {lastSummary && !isClockedIn && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Today's session report
            </div>
            <p className="text-sm leading-relaxed">
              {lastSummary.summary ?? "Session recorded — summary unavailable."}
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span>{fmt(lastSummary.activeSec)} active</span>
              <span>{lastSummary.lessonsCount} lessons</span>
              <span>{lastSummary.projectsCount} projects</span>
              <span>{lastSummary.gradesCount} grades</span>
              <span className="capitalize">
                ended: {lastSummary.endReason.replace("_", " ")}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 font-display text-xl font-semibold tabular-nums ${muted ? "text-muted-foreground" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
