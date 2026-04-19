import * as React from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UseFocusTrackerOpts {
  userId: string | undefined;
  courseId?: string | null;
  lessonId?: string | null;
  /** Capture a webcam snapshot every N seconds (default 5 min). 0 disables. */
  webcamIntervalSec?: number;
  /** Capture a screen-share snapshot every N seconds (default 5 min). 0 disables. */
  screenIntervalSec?: number;
}

interface FocusState {
  sessionId: string | null;
  running: boolean;
  activeSeconds: number;
  idleSeconds: number;
  blurCount: number;
  lastSnapshotAt: number | null;
  webcamReady: boolean;
  screenReady: boolean;
}

const HEARTBEAT_MS = 30_000;
const IDLE_THRESHOLD_MS = 2 * 60 * 1000; // 2 min

export function useFocusTracker(opts: UseFocusTrackerOpts) {
  const { userId, courseId = null, lessonId = null } = opts;
  const webcamIntervalSec = opts.webcamIntervalSec ?? 300;
  const screenIntervalSec = opts.screenIntervalSec ?? 300;

  const [state, setState] = React.useState<FocusState>({
    sessionId: null,
    running: false,
    activeSeconds: 0,
    idleSeconds: 0,
    blurCount: 0,
    lastSnapshotAt: null,
    webcamReady: false,
    screenReady: false,
  });

  const webcamStream = React.useRef<MediaStream | null>(null);
  const screenStream = React.useRef<MediaStream | null>(null);
  const lastActivity = React.useRef<number>(Date.now());
  const hbInterval = React.useRef<number | null>(null);
  const camInterval = React.useRef<number | null>(null);
  const scrInterval = React.useRef<number | null>(null);
  const sessionRef = React.useRef<string | null>(null);

  // Track activity
  React.useEffect(() => {
    const onActivity = () => {
      lastActivity.current = Date.now();
    };
    const onBlur = () => {
      setState((s) => ({ ...s, blurCount: s.blurCount + 1 }));
    };
    window.addEventListener("mousemove", onActivity);
    window.addEventListener("keydown", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const captureFromStream = React.useCallback(
    async (stream: MediaStream, kind: "webcam" | "screen") => {
      const sid = sessionRef.current;
      if (!sid || !userId) return;
      try {
        const track = stream.getVideoTracks()[0];
        if (!track) return;
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

        const path = `${userId}/${sid}/${kind}-${Date.now()}.jpg`;
        const { error: upErr } = await supabase.storage
          .from("attendance")
          .upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (upErr) {
          console.warn("snapshot upload failed", upErr);
          return;
        }
        await supabase.from("attendance_snapshots").insert({
          session_id: sid,
          user_id: userId,
          kind,
          storage_path: path,
        });
        setState((s) => ({ ...s, lastSnapshotAt: Date.now() }));
      } catch (e) {
        console.warn("snapshot error", e);
      }
    },
    [userId],
  );

  const stop = React.useCallback(async () => {
    if (hbInterval.current) window.clearInterval(hbInterval.current);
    if (camInterval.current) window.clearInterval(camInterval.current);
    if (scrInterval.current) window.clearInterval(scrInterval.current);
    hbInterval.current = null;
    camInterval.current = null;
    scrInterval.current = null;

    webcamStream.current?.getTracks().forEach((t) => t.stop());
    screenStream.current?.getTracks().forEach((t) => t.stop());
    webcamStream.current = null;
    screenStream.current = null;

    const sid = sessionRef.current;
    if (sid) {
      await supabase
        .from("study_sessions")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", sid);
    }
    sessionRef.current = null;
    setState((s) => ({
      ...s,
      sessionId: null,
      running: false,
      webcamReady: false,
      screenReady: false,
    }));
  }, []);

  const start = React.useCallback(
    async () => {
      if (!userId) {
        toast.error("Sign in first");
        return;
      }
      if (sessionRef.current) return;

      // 1. Webcam (mandatory)
      let cam: MediaStream | null = null;
      try {
        cam = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
      } catch (e) {
        console.error("webcam failed", e);
        toast.error("Webcam access required. Allow camera in your browser, then try again.");
        return;
      }
      webcamStream.current = cam;

      // 2. Screen share (also mandatory)
      let scr: MediaStream | null = null;
      try {
        scr = await (navigator.mediaDevices as MediaDevices & {
          getDisplayMedia: (c: MediaStreamConstraints) => Promise<MediaStream>;
        }).getDisplayMedia({ video: true, audio: false });
      } catch (e) {
        console.error("screen share failed", e);
        cam.getTracks().forEach((t) => t.stop());
        webcamStream.current = null;
        toast.error("Screen share required. Pick your entire screen when prompted, then try again.");
        return;
      }
      screenStream.current = scr;
      scr.getVideoTracks()[0]?.addEventListener("ended", () => {
        // If user stops sharing mid-session, auto clock out
        toast("Screen share ended — clocking out.");
        stop();
      });

      // 3. Create session row
      const { data: sess, error } = await supabase
        .from("study_sessions")
        .insert({
          user_id: userId,
          course_id: courseId,
          lesson_id: lessonId,
          client_info: {
            ua: navigator.userAgent,
            screen_share: !!scr,
          },
        })
        .select("id")
        .single();
      if (error || !sess) {
        toast.error("Could not start session: " + (error?.message ?? ""));
        cam.getTracks().forEach((t) => t.stop());
        scr?.getTracks().forEach((t) => t.stop());
        return;
      }
      sessionRef.current = sess.id;
      lastActivity.current = Date.now();

      setState({
        sessionId: sess.id,
        running: true,
        activeSeconds: 0,
        idleSeconds: 0,
        blurCount: 0,
        lastSnapshotAt: null,
        webcamReady: true,
        screenReady: !!scr,
      });

      // 4. Heartbeat
      hbInterval.current = window.setInterval(async () => {
        const visible = document.visibilityState === "visible";
        const idle = Date.now() - lastActivity.current > IDLE_THRESHOLD_MS;
        const delta = HEARTBEAT_MS / 1000;

        setState((s) => {
          const next = { ...s };
          if (visible && !idle) next.activeSeconds = s.activeSeconds + delta;
          else next.idleSeconds = s.idleSeconds + delta;
          return next;
        });

        const sid = sessionRef.current;
        if (!sid) return;
        // Read current counters from a fresh state snapshot
        try {
          await supabase.rpc("close_stale_sessions");
        } catch {
          /* ignore */
        }
        const { data: cur } = await supabase
          .from("study_sessions")
          .select("active_seconds, idle_seconds, blur_count")
          .eq("id", sid)
          .maybeSingle();
        const a = (cur?.active_seconds ?? 0) + (visible && !idle ? delta : 0);
        const i = (cur?.idle_seconds ?? 0) + (visible && !idle ? 0 : delta);
        await supabase
          .from("study_sessions")
          .update({
            active_seconds: Math.round(a),
            idle_seconds: Math.round(i),
            last_heartbeat_at: new Date().toISOString(),
          })
          .eq("id", sid);

        // Auto clock-out after 10 min idle
        if (Date.now() - lastActivity.current > 10 * 60 * 1000) {
          toast("Auto clocked out — 10 min inactivity");
          stop();
        }
      }, HEARTBEAT_MS);

      // 5. Snapshot intervals
      if (webcamIntervalSec > 0 && cam) {
        // first snapshot after 30s, then on interval
        window.setTimeout(() => captureFromStream(cam!, "webcam"), 30_000);
        camInterval.current = window.setInterval(
          () => captureFromStream(cam!, "webcam"),
          webcamIntervalSec * 1000,
        );
      }
      if (screenIntervalSec > 0 && scr) {
        window.setTimeout(() => captureFromStream(scr!, "screen"), 30_000);
        scrInterval.current = window.setInterval(
          () => screenStream.current && captureFromStream(screenStream.current, "screen"),
          screenIntervalSec * 1000,
        );
      }
    },
    [userId, courseId, lessonId, webcamIntervalSec, screenIntervalSec, captureFromStream, stop],
  );

  // Stop on unmount / page close
  React.useEffect(() => {
    const onUnload = () => {
      const sid = sessionRef.current;
      if (sid) {
        // Best-effort: navigator.sendBeacon-style not available for supabase, fire-and-forget
        supabase
          .from("study_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", sid);
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      stop();
    };
  }, [stop]);

  return { state, start, stop };
}
