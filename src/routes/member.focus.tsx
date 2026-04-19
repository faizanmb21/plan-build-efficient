import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useFocusTracker } from "@/hooks/use-focus-tracker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Camera, Monitor, Play, Square, Activity, Clock, Coffee } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/member/focus")({
  component: FocusPage,
});

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function FocusPage() {
  const { user } = useAuth();
  const { state, start, stop } = useFocusTracker({ userId: user?.id });
  const [todayActive, setTodayActive] = React.useState(0);
  const [todayIdle, setTodayIdle] = React.useState(0);
  const [snapCount, setSnapCount] = React.useState(0);

  const reload = React.useCallback(async () => {
    if (!user) return;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("study_sessions")
      .select("active_seconds, idle_seconds")
      .eq("user_id", user.id)
      .gte("started_at", dayStart.toISOString());
    const a = (data ?? []).reduce((sum, r) => sum + (r.active_seconds ?? 0), 0);
    const i = (data ?? []).reduce((sum, r) => sum + (r.idle_seconds ?? 0), 0);
    setTodayActive(a);
    setTodayIdle(i);

    const { count } = await supabase
      .from("attendance_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("captured_at", dayStart.toISOString());
    setSnapCount(count ?? 0);
  }, [user]);

  React.useEffect(() => {
    reload();
    const i = window.setInterval(reload, 30_000);
    return () => window.clearInterval(i);
  }, [reload, state.activeSeconds]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tight">Focus session</h1>
        <p className="text-muted-foreground mt-1">
          Clock in to start tracking your training time. Screen snapshots are captured every 5 minutes.
        </p>
      </div>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            {state.running ? "Session live" : "Not clocked in"}
          </CardTitle>
          <CardDescription>
            {state.running
              ? "Focused time is being recorded. Stay on this tab — switching away counts as idle. Stopping screen share will clock you out."
              : "You'll be asked to pick a screen or window to share. Sharing is required."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Session active" value={fmt(state.activeSeconds)} icon={Clock} />
            <Stat label="Session idle" value={fmt(state.idleSeconds)} icon={Coffee} />
            <Stat label="Tab blurs" value={state.blurCount.toString()} icon={Activity} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={state.screenReady ? "default" : "outline"}>
              <Monitor className="h-3 w-3 mr-1" />
              Screen {state.screenReady ? "sharing" : "off"}
            </Badge>
            {state.lastSnapshotAt && (
              <Badge variant="outline">
                Last snapshot {Math.round((Date.now() - state.lastSnapshotAt) / 1000)}s ago
              </Badge>
            )}
          </div>

          <div className="flex gap-2">
            {!state.running ? (
              <Button onClick={() => start()} className="gap-2">
                <Play className="h-4 w-4" /> Clock in (webcam + screen share)
              </Button>
            ) : (
              <Button onClick={stop} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" /> Clock out
              </Button>
            )}
          </div>
          {!state.running && (
            <p className="text-xs text-muted-foreground">
              You'll be asked for camera access, then to pick a screen/window to share. Both are required — sessions stop if either is denied or the screen share ends.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
          <CardDescription>Your focused minutes across all sessions today.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Active today" value={fmt(todayActive)} icon={Clock} />
            <Stat label="Idle today" value={fmt(todayIdle)} icon={Coffee} />
            <Stat label="Check-ins" value={snapCount.toString()} icon={Camera} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-2xl font-display font-semibold tabular-nums">{value}</div>
    </div>
  );
}
