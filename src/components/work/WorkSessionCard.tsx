import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWorkSession } from "@/hooks/use-work-session";
import { Play, Square, Clock, Sparkles, Loader2 } from "lucide-react";

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WorkSessionCard() {
  const {
    isClockedIn,
    startedAt,
    activeSeconds,
    start,
    stop,
    isClockingIn,
    isClockingOut,
    lastSummary,
  } = useWorkSession();

  // Live tick
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!isClockedIn) return;
    const t = window.setInterval(force, 1000);
    return () => window.clearInterval(t);
  }, [isClockedIn]);

  const elapsedSec = isClockedIn && startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" />
              Work session
            </CardTitle>
            <CardDescription>
              {isClockedIn
                ? "Your focused time is being recorded."
                : "Start your work session when you sit down to learn."}
            </CardDescription>
          </div>
          {isClockedIn && (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
              <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Elapsed" value={fmt(elapsedSec)} />
          <Stat label="Active" value={fmt(activeSeconds)} />
        </div>

        <div className="flex gap-2">
          {isClockedIn ? (
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
          ) : (
            <Button onClick={start} disabled={isClockingIn} className="gap-2">
              {isClockingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start work
            </Button>
          )}
        </div>

        {!isClockedIn && (
          <p className="text-xs text-muted-foreground">
            Auto clock-out: 2 min idle on a course page, or 3 min idle anywhere in the app.
          </p>
        )}

        {lastSummary && !isClockedIn && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Last session summary
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
