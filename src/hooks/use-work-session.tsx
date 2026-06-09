import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  clockIn as clockInFn,
  clockOut as clockOutFn,
  heartbeatSession as heartbeatFn,
} from "@/lib/work-session.functions";
import { toast } from "sonner";

const GLOBAL_IDLE_MS = 3 * 60 * 1000; // 3 minutes
const HEARTBEAT_MS = 30 * 1000;

export type ClockOutReason = "manual" | "auto_idle_global" | "auto_idle_course";

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
  isClockingIn: boolean;
  isClockingOut: boolean;
  pausedReason: ClockOutReason | null;
  lastSummary: LastSessionSummary | null;
  start: () => Promise<void>;
  stop: (reason?: ClockOutReason) => Promise<void>;
  dismissPaused: () => void;
  /** Called by course pages to register a 2-min scroll/click idle watcher. */
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

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [activeSeconds, setActiveSeconds] = React.useState(0);
  const [isClockingIn, setIsClockingIn] = React.useState(false);
  const [isClockingOut, setIsClockingOut] = React.useState(false);
  const [pausedReason, setPausedReason] = React.useState<ClockOutReason | null>(null);
  const [lastSummary, setLastSummary] = React.useState<LastSessionSummary | null>(null);

  const lastActivityRef = React.useRef<number>(Date.now());
  const unsentActiveRef = React.useRef<number>(0);
  const sessionRef = React.useRef<string | null>(null);
  const courseModeRef = React.useRef<number>(0); // ref count for course pages active

  const isClockedIn = !!sessionId;

  // Resume an open session on mount
  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("study_sessions")
        .select("id, started_at, active_seconds")
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
      }
    })();
  }, [user]);

  // Activity listeners — only matter when clocked in
  React.useEffect(() => {
    if (!isClockedIn) return;
    const onActivity = () => {
      lastActivityRef.current = Date.now();
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

  const stop = React.useCallback(
    async (reason: ClockOutReason = "manual") => {
      const sid = sessionRef.current;
      if (!sid) return;
      setIsClockingOut(true);
      try {
        const accessToken = await getToken();
        const res = await clockOutRpc({
          data: {
            sessionId: sid,
            endReason: reason,
            deltaActiveSec: unsentActiveRef.current,
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

  // Heartbeat + idle detection
  React.useEffect(() => {
    if (!isClockedIn) return;
    const t = window.setInterval(async () => {
      const sinceActivity = Date.now() - lastActivityRef.current;
      const delta = HEARTBEAT_MS / 1000;
      if (sinceActivity < HEARTBEAT_MS * 2) {
        setActiveSeconds((s) => s + delta);
        unsentActiveRef.current += delta;
      }
      // Send heartbeat batch
      const sid = sessionRef.current;
      if (sid && unsentActiveRef.current > 0) {
        const toSend = unsentActiveRef.current;
        unsentActiveRef.current = 0;
        try {
          const accessToken = await getToken();
          await heartbeatRpc({ data: { sessionId: sid, deltaActiveSec: toSend, accessToken } });
        } catch (e) {
          // Re-queue on failure
          unsentActiveRef.current += toSend;
        }
      }
      // Global 3-min idle trigger
      if (sinceActivity >= GLOBAL_IDLE_MS) {
        stop("auto_idle_global");
      }
    }, HEARTBEAT_MS);
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
      lastActivityRef.current = Date.now();
      unsentActiveRef.current = 0;
      toast.success("Clocked in. Work session started.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clock in");
    } finally {
      setIsClockingIn(false);
    }
  }, [clockInRpc]);

  const registerCourseActivity = React.useCallback(() => {
    courseModeRef.current += 1;
    let timer: number | null = null;
    let lastCourseActivity = Date.now();

    const reset = () => {
      lastCourseActivity = Date.now();
    };

    const handlers = ["scroll", "click", "keydown", "touchstart"] as const;
    handlers.forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions),
    );

    timer = window.setInterval(() => {
      if (!sessionRef.current) return;
      if (Date.now() - lastCourseActivity >= 2 * 60 * 1000) {
        stop("auto_idle_course");
      }
    }, 15_000);

    return () => {
      courseModeRef.current = Math.max(0, courseModeRef.current - 1);
      if (timer) window.clearInterval(timer);
      handlers.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, [stop]);

  const dismissPaused = React.useCallback(() => setPausedReason(null), []);

  const value: Ctx = {
    sessionId,
    startedAt,
    activeSeconds,
    isClockedIn,
    isClockingIn,
    isClockingOut,
    pausedReason,
    lastSummary,
    start,
    stop,
    dismissPaused,
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
