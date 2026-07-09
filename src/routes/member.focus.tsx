import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useWorkSession } from "@/hooks/use-work-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Monitor,
  Play,
  Square,
  Activity,
  Clock,
  Coffee,
  Camera,
  Upload,
  Pause,
  PlayCircle,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatClock, formatDuration } from "@/lib/format-duration";

export const Route = createFileRoute("/member/focus")({
  component: FocusPage,
});

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000; // 5 min

function FocusPage() {
  const { user } = useAuth();
  const {
    sessionId,
    isClockedIn,
    isPaused,
    activeSeconds,
    startedAt,
    start,
    stop,
    pause,
    resume,
    isClockingIn,
    isClockingOut,
    isPausing,
  } = useWorkSession();

  const screenStreamRef = React.useRef<MediaStream | null>(null);
  const snapTimerRef = React.useRef<number | null>(null);
  const [screenReady, setScreenReady] = React.useState(false);
  const [lastSnapshotAt, setLastSnapshotAt] = React.useState<number | null>(null);

  const [todayActive, setTodayActive] = React.useState(0);
  const [snapCount, setSnapCount] = React.useState(0);
  const [uploadingCheckin, setUploadingCheckin] = React.useState(false);
  const checkinRef = React.useRef<HTMLInputElement>(null);

  // Live tick for elapsed
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!isClockedIn || isPaused) return;
    const t = window.setInterval(force, 1000);
    return () => window.clearInterval(t);
  }, [isClockedIn, isPaused]);

  const elapsedSec =
    isClockedIn && startedAt && !isPaused ? Math.floor((Date.now() - startedAt) / 1000) : 0;

  const captureSnapshot = React.useCallback(async () => {
    const stream = screenStreamRef.current;
    const sid = sessionId;
    if (!stream || !sid || !user) return;
    try {
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== "live") return;
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      await new Promise((r) => setTimeout(r, 200));
      const w = video.videoWidth || 640;
      const h = video.videoHeight || 480;
      const canvas = document.createElement("canvas");
      canvas.width = Math.min(w, 960);
      canvas.height = Math.round((canvas.width * h) / w);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.7),
      );
      video.pause();
      video.srcObject = null;
      if (!blob) return;
      const path = `${user.id}/${sid}/screen-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("attendance")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (upErr) return;
      await supabase.from("attendance_snapshots").insert({
        session_id: sid,
        user_id: user.id,
        kind: "screen" as any,
        storage_path: path,
      });
      setLastSnapshotAt(Date.now());
    } catch (e) {
      console.warn("snapshot error", e);
    }
  }, [sessionId, user]);

  const stopScreenShare = React.useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenReady(false);
    if (snapTimerRef.current) {
      window.clearInterval(snapTimerRef.current);
      snapTimerRef.current = null;
    }
  }, []);

  // When session ends externally (other tab, dashboard), tear down screen share.
  React.useEffect(() => {
    if (!isClockedIn) stopScreenShare();
  }, [isClockedIn, stopScreenShare]);

  React.useEffect(() => {
    return () => stopScreenShare();
  }, [stopScreenShare]);

  async function handleClockIn() {
    if (!user) {
      toast.error("Sign in first");
      return;
    }
    // Request screen share BEFORE creating the session (must be in user gesture)
    let scr: MediaStream;
    try {
      scr = await (
        navigator.mediaDevices as MediaDevices & {
          getDisplayMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
        }
      ).getDisplayMedia({ video: true, audio: false });
    } catch {
      toast.error("Screen share required. Pick a screen/window when prompted, then try again.");
      return;
    }
    screenStreamRef.current = scr;
    setScreenReady(true);
    scr.getVideoTracks()[0]?.addEventListener("ended", () => {
      toast("Screen share ended — clocking out.");
      stop("manual");
    });

    await start();

    // First snapshot after 30s, then every 5 min
    window.setTimeout(() => captureSnapshot(), 30_000);
    snapTimerRef.current = window.setInterval(captureSnapshot, SNAPSHOT_INTERVAL_MS);
  }

  async function handleClockOut() {
    stopScreenShare();
    await stop("manual");
  }

  async function onCheckinPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Photo must be under 8MB");
      return;
    }
    setUploadingCheckin(true);
    try {
      const ts = Date.now();
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/manual/${ts}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("attendance")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("attendance_snapshots").insert({
        user_id: user.id,
        kind: "manual",
        storage_path: path,
        session_id: sessionId,
      });
      if (insErr) throw insErr;
      toast.success("Check-in photo uploaded");
      reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setUploadingCheckin(false);
      if (checkinRef.current) checkinRef.current.value = "";
    }
  }

  const reload = React.useCallback(async () => {
    if (!user) return;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("study_sessions")
      .select("active_seconds")
      .eq("user_id", user.id)
      .gte("started_at", dayStart.toISOString());
    const a = (data ?? []).reduce((sum, r) => sum + (r.active_seconds ?? 0), 0);
    setTodayActive(a);

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
  }, [reload]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tight">Focus session</h1>
        <p className="text-muted-foreground mt-1">
          Same session as the dashboard work timer — clocking in or out here affects both. Screen
          snapshots are captured every 5 minutes while clocked in.
        </p>
      </div>

      <Card className={isPaused ? "border-amber-500/40" : "border-primary/30"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            {isClockedIn ? (isPaused ? "Session paused" : "Session live") : "Not clocked in"}
          </CardTitle>
          <CardDescription>
            {isClockedIn
              ? isPaused
                ? "Timer is frozen. Resume when you're back."
                : "Focused time is being recorded until you clock out."
              : "You'll be asked to pick a screen or window to share. Sharing is required."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Elapsed (this session)" value={formatClock(elapsedSec)} icon={Clock} />
            <Stat label="Active (this session)" value={formatClock(activeSeconds)} icon={Clock} />
            <Stat label="Active today" value={formatDuration(todayActive)} icon={Coffee} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={screenReady ? "default" : "outline"}>
              <Monitor className="h-3 w-3 mr-1" />
              Screen {screenReady ? "sharing" : "off"}
            </Badge>
            {lastSnapshotAt && (
              <Badge variant="outline">
                Last snapshot {formatDuration(Math.round((Date.now() - lastSnapshotAt) / 1000))} ago
              </Badge>
            )}
            <Badge variant="outline">Snapshots today: {snapCount}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            {!isClockedIn ? (
              <Button onClick={handleClockIn} disabled={isClockingIn} className="gap-2">
                {isClockingIn ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Clock in (screen share)
              </Button>
            ) : (
              <>
                {isPaused ? (
                  <Button onClick={resume} disabled={isPausing} className="gap-2">
                    {isPausing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Resume
                  </Button>
                ) : (
                  <Button onClick={pause} disabled={isPausing} variant="secondary" className="gap-2">
                    {isPausing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pause className="h-4 w-4" />}
                    Pause
                  </Button>
                )}
                <Button
                  onClick={handleClockOut}
                  disabled={isClockingOut}
                  variant="destructive"
                  className="gap-2"
                >
                  {isClockingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                  Clock out
                </Button>
              </>
            )}
          </div>
          {!isClockedIn && (
            <p className="text-xs text-muted-foreground">
              You'll be asked to pick a screen/window. Stopping the share will clock you out. Your
              clock keeps running until you clock out.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" /> Check-in photo
          </CardTitle>
          <CardDescription>
            Upload a quick selfie as proof of attendance. Your incharge and CEO will see it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={checkinRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={onCheckinPhoto}
          />
          <Button
            onClick={() => checkinRef.current?.click()}
            disabled={uploadingCheckin}
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            {uploadingCheckin ? "Uploading…" : "Upload check-in photo"}
          </Button>
          <p className="text-xs text-muted-foreground">
            On mobile, this opens the camera. On desktop, pick an image file (max 8MB).
          </p>
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
