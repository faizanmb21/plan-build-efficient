import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  clockIn as clockInFn,
  clockOut as clockOutFn,
  heartbeatSession as heartbeatFn,
  pauseSession as pauseFn,
  resumeSession as resumeFn,
} from "@/lib/work-session.functions";
import { toast } from "sonner";

const GLOBAL_IDLE_MS = 3 * 60 * 1000; // 3 minutes
const COURSE_IDLE_MS = 2 * 60 * 1000; // 2 minutes
const WARNING_GRACE_MS = 30 * 1000; // 30-second warning
const HEARTBEAT_MS = 30 * 1000;

export type ClockOutReason = "manual" | "auto_idle_global" | "auto_idle_course";
export type SessionStatus = "active" | "paused";
export type IdleWarning = null | "global" | "course";

export interface LastSessionSummary {
  sessionId: string;
  endedAt: string;
  activeSec: number;
  summary: string | null;
  lessonsCount: number;
  projectsCount: number;
  gradesCount: number;
  endReason: ClockOutReason;
}

interface Ctx {
  sessionId: string | null;
  startedAt: number | null;
  activeSeconds: number;
  isClockedIn: boolean;
  isPaused: boolean;
  isClockingIn: boolean;
  isClockingOut: boolean;
  isPausing: boolean;
  pausedReason: ClockOutReason | null;
  lastSummary: LastSessionSummary | null;
  idleWarning: IdleWarning;
  start: () => Promise<void>;
  stop: (reason?: ClockOutReason) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  dismissPaused: () => void;
  dismissIdleWarning: () => void;
  registerCourseActivity: () => () => void;
}

const WorkSessionContext = React.createContext<Ctx | null>(null);

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export function WorkSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const clockInRpc = useServerFn(clockInFn);
  const clockOutRpc = useServerFn(clockOutFn);
  const heartbeatRpc = useServerFn(heartbeatFn);
  const pauseRpc = useServerFn(pauseFn);
  const resumeRpc = useServerFn(resumeFn);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [activeSeconds, setActiveSeconds] = React.useState(0);
  const [isClockingIn, setIsClockingIn] = React.useState(false);
  const [isClockingOut, setIsClockingOut] = React.useState(false);
  const [isPausing, setIsPausing] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [pausedReason, setPausedReason] = React.useState<ClockOutReason | null>(null);
  const [lastSummary, setLastSummary] = React.useState<LastSessionSummary | null>(null);
  const [idleWarning, setIdleWarning] = React.useState<IdleWarning>(null);

  const lastActivityRef = React.useRef<number>(Date.now());
  const lastCourseActivityRef = React.useRef<number>(Date.now());
  const unsentActiveRef = React.useRef<number>(0);
  const sessionRef = React.useRef<string | null>(null);
  const pausedRef = React.useRef<boolean>(false);
  const courseActiveRef = React.useRef<number>(0);
  // Wallclock tick anchor so elapsed time keeps advancing even when the
  // background tab throttles our interval (browser fires it less often, but
  // each tick adds the real wallclock delta, not a fixed 30s).
  const lastTickRef = React.useRef<number>(Date.now());

  const isClockedIn = !!sessionId;

  React.useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  // Resume an open session on mount
  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("study_sessions")
        .select("id, started_at, active_seconds, status")
        .eq("user_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setSessionId(data.id);
        sessionRef.current = data.id;
        setStartedAt(new Date(data.started_at).getTime());
        setActiveSeconds(data.active_seconds ?? 0);
        const paused = (data as any).status === "paused";
        setIsPaused(paused);
        pausedRef.current = paused;
      }
    })();
  }, [user]);

  // Activity listeners — only matter when clocked in (we still listen while paused so
  // resume detection works via dismissIdleWarning if user clicks "I'm here")
  React.useEffect(() => {
    if (!isClockedIn) return;
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      lastCourseActivityRef.current = Date.now();
      // Activity dismisses any pending warning
      setIdleWarning((w) => (w ? null : w));
    };
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("scroll", onActivity);
    };
  }, [isClockedIn]);

  // Page Visibility — when the tab is hidden no user-input events fire,
  // so we'd wrongly trip the idle timers. When the tab becomes visible
  // again, reset the activity refs so the user gets a fresh idle window
  // and the timer display recomputes immediately.
  React.useEffect(() => {
    if (!isClockedIn) return;
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        lastActivityRef.current = now;
        lastCourseActivityRef.current = now;
        // Force a re-render so the displayed elapsed time catches up.
        setActiveSeconds((s) => s);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isClockedIn]);


  const stop = React.useCallback(
    async (reason: ClockOutReason = "manual") => {
      const sid = sessionRef.current;
      if (!sid) return;
      setIsClockingOut(true);
      setIdleWarning(null);
      try {
        const accessToken = await getToken();
        const res = await clockOutRpc({
          data: {
            sessionId: sid,
            endReason: reason,
            deltaActiveSec: pausedRef.current ? 0 : unsentActiveRef.current,
            accessToken,
          },
        });
        unsentActiveRef.current = 0;
        if (res.ok) {
          setLastSummary({
            sessionId: res.sessionId,
            endedAt: res.endedAt,
            activeSec: res.activeSec,
            summary: res.summary,
            lessonsCount: res.lessonsCount,
            projectsCount: res.projectsCount,
            gradesCount: res.gradesCount,
            endReason: reason,
          });
        }
        sessionRef.current = null;
        setSessionId(null);
        setStartedAt(null);
        setActiveSeconds(0);
        setIsPaused(false);
        pausedRef.current = false;
        if (reason !== "manual") setPausedReason(reason);
      } catch (e) {
        console.error("clockOut failed", e);
        toast.error("Failed to clock out");
      } finally {
        setIsClockingOut(false);
      }
    },
    [clockOutRpc],
  );

  // Heartbeat + idle detection (global)
  React.useEffect(() => {
    if (!isClockedIn) return;
    lastTickRef.current = Date.now();
    const t = window.setInterval(async () => {
      const now = Date.now();
      // Real wallclock delta — keeps advancing correctly even when the
      // browser throttles this interval for a hidden tab.
      const deltaSec = Math.max(0, (now - lastTickRef.current) / 1000);
      lastTickRef.current = now;

      // While paused: no active accumulation, no idle triggers, no warning.
      if (pausedRef.current) return;

      // Timer always counts up while clocked in — hidden tab still counts.
      if (deltaSec > 0) {
        setActiveSeconds((s) => s + deltaSec);
        unsentActiveRef.current += deltaSec;
      }

      const sid = sessionRef.current;
      if (sid && unsentActiveRef.current >= HEARTBEAT_MS / 1000) {
        const toSend = unsentActiveRef.current;
        unsentActiveRef.current = 0;
        try {
          const accessToken = await getToken();
          await heartbeatRpc({ data: { sessionId: sid, deltaActiveSec: toSend, accessToken } });
        } catch {
          unsentActiveRef.current += toSend;
        }
      }

      // Idle checks only count time the user could actually have interacted.
      // If the tab is hidden, mousemove/keydown don't fire, so we pause the
      // idle countdown by treating "now" as the last activity moment.
      if (document.visibilityState !== "visible") {
        lastActivityRef.current = now;
        lastCourseActivityRef.current = now;
        return;
      }

      const sinceActivity = now - lastActivityRef.current;
      if (sinceActivity >= GLOBAL_IDLE_MS) {
        stop("auto_idle_global");
      } else if (sinceActivity >= GLOBAL_IDLE_MS - WARNING_GRACE_MS) {
        setIdleWarning((w) => w ?? "global");
      }
    }, HEARTBEAT_MS / 6); // ~5s — finer granularity for warning timing
    return () => window.clearInterval(t);
  }, [isClockedIn, heartbeatRpc, stop]);

  const start = React.useCallback(async () => {
    if (sessionRef.current) return;
    setIsClockingIn(true);
    setPausedReason(null);
    setLastSummary(null);
    try {
      const accessToken = await getToken();
      const res = await clockInRpc({ data: { accessToken } });
      if (!res.ok) {
        toast.error(res.error || "Could not clock in");
        return;
      }
      sessionRef.current = res.sessionId;
      setSessionId(res.sessionId);
      setStartedAt(new Date(res.startedAt).getTime());
      setActiveSeconds(0);
      setIsPaused(res.status === "paused");
      pausedRef.current = res.status === "paused";
      lastActivityRef.current = Date.now();
      lastCourseActivityRef.current = Date.now();
      unsentActiveRef.current = 0;
      toast.success("Clocked in. Work session started.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clock in");
    } finally {
      setIsClockingIn(false);
    }
  }, [clockInRpc]);

  const pause = React.useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || pausedRef.current) return;
    setIsPausing(true);
    try {
      const accessToken = await getToken();
      const toSend = unsentActiveRef.current;
      unsentActiveRef.current = 0;
      const res = await pauseRpc({
        data: { sessionId: sid, deltaActiveSec: toSend, accessToken },
      });
      if (!res.ok) {
        toast.error(res.error || "Could not pause");
        unsentActiveRef.current += toSend;
        return;
      }
      setIsPaused(true);
      pausedRef.current = true;
      setIdleWarning(null);
      toast.success("Session paused. Idle checks suspended.");
    } finally {
      setIsPausing(false);
    }
  }, [pauseRpc]);

  const resume = React.useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || !pausedRef.current) return;
    setIsPausing(true);
    try {
      const accessToken = await getToken();
      const res = await resumeRpc({ data: { sessionId: sid, accessToken } });
      if (!res.ok) {
        toast.error(res.error || "Could not resume");
        return;
      }
      setIsPaused(false);
      pausedRef.current = false;
      lastActivityRef.current = Date.now();
      lastCourseActivityRef.current = Date.now();
      toast.success("Resumed. Welcome back.");
    } finally {
      setIsPausing(false);
    }
  }, [resumeRpc]);

  const registerCourseActivity = React.useCallback(() => {
    courseActiveRef.current += 1;
    lastCourseActivityRef.current = Date.now();

    const reset = () => {
      lastCourseActivityRef.current = Date.now();
    };

    const handlers = ["scroll", "click", "keydown", "touchstart", "mousemove"] as const;
    handlers.forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions),
    );

    const timer = window.setInterval(() => {
      if (!sessionRef.current || pausedRef.current) return;
      const since = Date.now() - lastCourseActivityRef.current;
      if (since >= COURSE_IDLE_MS) {
        stop("auto_idle_course");
      } else if (since >= COURSE_IDLE_MS - WARNING_GRACE_MS) {
        setIdleWarning((w) => w ?? "course");
      }
    }, 5_000);

    return () => {
      courseActiveRef.current = Math.max(0, courseActiveRef.current - 1);
      window.clearInterval(timer);
      handlers.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [stop]);

  const dismissPaused = React.useCallback(() => setPausedReason(null), []);
  const dismissIdleWarning = React.useCallback(() => {
    lastActivityRef.current = Date.now();
    lastCourseActivityRef.current = Date.now();
    setIdleWarning(null);
  }, []);

  const value: Ctx = {
    sessionId,
    startedAt,
    activeSeconds,
    isClockedIn,
    isPaused,
    isClockingIn,
    isClockingOut,
    isPausing,
    pausedReason,
    lastSummary,
    idleWarning,
    start,
    stop,
    pause,
    resume,
    dismissPaused,
    dismissIdleWarning,
    registerCourseActivity,
  };

  return <WorkSessionContext.Provider value={value}>{children}</WorkSessionContext.Provider>;
}

export function useWorkSession(): Ctx {
  const ctx = React.useContext(WorkSessionContext);
  if (!ctx) throw new Error("useWorkSession must be used inside WorkSessionProvider");
  return ctx;
}

/** Mount inside a course-page route to enable Trigger A (2-min idle on course pages). */
export function useCourseInactivityClockOut() {
  const { registerCourseActivity, isClockedIn } = useWorkSession();
  React.useEffect(() => {
    if (!isClockedIn) return;
    return registerCourseActivity();
  }, [registerCourseActivity, isClockedIn]);
}
