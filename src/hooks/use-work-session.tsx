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
  resumeOpenSession as resumeOpenSessionFn,
} from "@/lib/work-session.functions";
import { generateDayReport as generateDayReportFn } from "@/lib/day-report.functions";
import type { DayReportPayload } from "@/lib/day-report-types";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Timing model (server-authoritative, like Jibble/Clockify):
// - The SERVER owns time: active = (now - started_at) - paused time. The
//   browser is only a display and an activity sensor. Tab switching,
//   background throttling, tab freezing, or closing the tab can never corrupt
//   the clock — it keeps running server-side until an explicit clock-out.
// - Idle policy: only VISIBLE inactivity counts. 3 min of no input while the
//   app is visible → 60s warning with a fixed deadline → auto clock-out. Time
//   in a hidden tab NEVER counts toward idle.
// - Abandoned sessions (tab closed, laptop shut): the server sweeps any open
//   session whose last heartbeat is >30 min old and finalizes it backdated to
//   that heartbeat, so hours stay accurate and no zombie sessions linger.
// ---------------------------------------------------------------------------

const IDLE_MS = 3 * 60 * 1000; // visible inactivity before auto clock-out
const WARNING_GRACE_MS = 60 * 1000; // warning shown for the final 60s
const HEARTBEAT_MS = 30 * 1000; // liveness ping cadence
const CHECK_MS = 5 * 1000; // engine tick
// If the engine tick gap is much larger than the cadence, the tab was
// throttled/frozen/hidden — that stretch must not count as idle.
const SUSPEND_GAP_MS = CHECK_MS * 3;
// Wake-ups after very long suspensions (laptop slept overnight with the tab
// open) go through a full server reconcile instead: the server finalizes the
// session backdated to its last heartbeat. Mirrors STALE_SESSION_MS on the
// server.
const STALE_RECONCILE_MS = 30 * 60 * 1000;

export type ClockOutReason = "manual" | "auto_idle_global" | "auto_idle_course";
export type IdleWarning = { kind: "global" | "course"; deadline: number } | null;

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
  lastDayReport: DayReportPayload | null;
  idleWarning: IdleWarning;
  start: () => Promise<void>;
  stop: (reason?: ClockOutReason) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  dismissPaused: () => void;
  dismissIdleWarning: () => void;
  dismissDayReport: () => void;
  registerCourseActivity: () => () => void;
}

const WorkSessionContext = React.createContext<Ctx | null>(null);

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

// Watching a lesson counts as working. Course videos are YouTube embeds inside
// an <iframe> (all mouse/keyboard events happen INSIDE the iframe, invisible to
// the parent window) or uploaded HTML5 <video> elements. So treat as active:
//  - focus currently inside any <iframe> (the trainee clicked into the player)
//  - any <video> on the page actually playing
// Without this, a member watching a 20-minute video gets auto-clocked-out at 3
// minutes because the parent page sees no input.
function isMediaActive(): boolean {
  if (typeof document === "undefined") return false;
  const ae = document.activeElement as HTMLElement | null;
  if (ae && ae.tagName === "IFRAME") return true;
  const vids = document.getElementsByTagName("video");
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i];
    if (!v.paused && !v.ended && v.readyState > 2) return true;
  }
  return false;
}

export function WorkSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const clockInRpc = useServerFn(clockInFn);
  const clockOutRpc = useServerFn(clockOutFn);
  const heartbeatRpc = useServerFn(heartbeatFn);
  const pauseRpc = useServerFn(pauseFn);
  const resumeRpc = useServerFn(resumeFn);
  const resumeOpenRpc = useServerFn(resumeOpenSessionFn);
  const generateDayReportRpc = useServerFn(generateDayReportFn);

  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [pausedSeconds, setPausedSeconds] = React.useState(0);
  const [pausedAtMs, setPausedAtMs] = React.useState<number | null>(null);
  const [isClockingIn, setIsClockingIn] = React.useState(false);
  const [isClockingOut, setIsClockingOut] = React.useState(false);
  const [isPausing, setIsPausing] = React.useState(false);
  const [isPaused, setIsPaused] = React.useState(false);
  const [pausedReason, setPausedReason] = React.useState<ClockOutReason | null>(null);
  const [lastDayReport, setLastDayReport] = React.useState<DayReportPayload | null>(null);
  const [idleWarning, setIdleWarning] = React.useState<IdleWarning>(null);

  const lastActivityRef = React.useRef<number>(Date.now());
  const lastCourseActivityRef = React.useRef<number>(Date.now());
  const sessionRef = React.useRef<string | null>(null);
  const pausedRef = React.useRef<boolean>(false);
  const stoppingRef = React.useRef<boolean>(false);
  const courseWatchersRef = React.useRef<number>(0);
  const warningRef = React.useRef<IdleWarning>(null);
  const lastEngineTickRef = React.useRef<number>(Date.now());
  const lastHeartbeatRef = React.useRef<number>(0);

  const isClockedIn = !!sessionId;

  React.useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);
  React.useEffect(() => {
    warningRef.current = idleWarning;
  }, [idleWarning]);

  // Derived display time — pure function of server timestamps + wall clock.
  // Always correct, instantly, no matter how long the tab was asleep.
  const [, forceRender] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!isClockedIn) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") forceRender();
    }, 1000);
    const onVis = () => forceRender();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isClockedIn]);

  const nowMs = Date.now();
  const activeSeconds = startedAt
    ? Math.max(
        0,
        Math.round((nowMs - startedAt) / 1000) -
          pausedSeconds -
          (pausedAtMs ? Math.max(0, Math.round((nowMs - pausedAtMs) / 1000)) : 0),
      )
    : 0;

  const adoptSession = React.useCallback(
    (s: {
      id: string;
      startedAt: string;
      status: "active" | "paused";
      pausedAt: string | null;
      pausedSeconds: number;
    }) => {
      sessionRef.current = s.id;
      setSessionId(s.id);
      setStartedAt(new Date(s.startedAt).getTime());
      setPausedSeconds(s.pausedSeconds ?? 0);
      setPausedAtMs(s.pausedAt ? new Date(s.pausedAt).getTime() : null);
      const paused = s.status === "paused";
      setIsPaused(paused);
      pausedRef.current = paused;
      const now = Date.now();
      lastActivityRef.current = now;
      lastCourseActivityRef.current = now;
      lastEngineTickRef.current = now;
      setIdleWarning(null);
    },
    [],
  );

  const clearLocalSession = React.useCallback(() => {
    sessionRef.current = null;
    setSessionId(null);
    setStartedAt(null);
    setPausedSeconds(0);
    setPausedAtMs(null);
    setIsPaused(false);
    pausedRef.current = false;
    setIdleWarning(null);
  }, []);

  // Reconcile with the server: sweeps abandoned sessions (backdating their
  // hours to the last heartbeat) and adopts the live one, if any. Runs on
  // mount and after very long suspensions (laptop slept with the tab open).
  const syncInFlightRef = React.useRef(false);
  const syncWithServer = React.useCallback(async () => {
    if (syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    try {
      const accessToken = await getToken();
      const res = await resumeOpenRpc({ data: { accessToken } });
      if (!res.ok) return;
      if (res.recovered) {
        toast.info(
          "Your previous session ended while you were away — those hours are saved.",
        );
      }
      if (res.session) adoptSession(res.session);
      else if (sessionRef.current) clearLocalSession();
    } catch (e) {
      console.warn("session sync failed", e);
    } finally {
      syncInFlightRef.current = false;
    }
  }, [resumeOpenRpc, adoptSession, clearLocalSession]);
  const syncRef = React.useRef(syncWithServer);
  React.useEffect(() => {
    syncRef.current = syncWithServer;
  }, [syncWithServer]);

  React.useEffect(() => {
    if (!user) return;
    syncRef.current();
  }, [user]);

  // Activity listeners — any real input resets both idle clocks and clears a
  // pending warning.
  React.useEffect(() => {
    if (!isClockedIn) return;
    const onActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      lastCourseActivityRef.current = now;
      setIdleWarning((w) => (w ? null : w));
    };
    // Fires when focus leaves the window — e.g. the trainee clicked into a
    // YouTube player iframe. That's activity, not stepping away.
    const onBlur = () => {
      if (document.activeElement?.tagName === "IFRAME") onActivity();
    };
    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("click", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("blur", onBlur);
    // Media events don't bubble — listen in the capture phase so any playing
    // <video> continuously counts as activity (timeupdate fires ~4×/sec).
    document.addEventListener("play", onActivity, true);
    document.addEventListener("playing", onActivity, true);
    document.addEventListener("timeupdate", onActivity, true);
    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("play", onActivity, true);
      document.removeEventListener("playing", onActivity, true);
      document.removeEventListener("timeupdate", onActivity, true);
    };
  }, [isClockedIn]);

  // Coming back to the tab always grants a fresh idle window.
  React.useEffect(() => {
    if (!isClockedIn) return;
    const onVis = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        lastActivityRef.current = now;
        lastCourseActivityRef.current = now;
        lastEngineTickRef.current = now;
        setIdleWarning(null);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [isClockedIn]);

  const stop = React.useCallback(
    async (reason: ClockOutReason = "manual") => {
      const sid = sessionRef.current;
      if (!sid || stoppingRef.current) return;
      stoppingRef.current = true;
      setIsClockingOut(true);
      setIdleWarning(null);
      try {
        const accessToken = await getToken();
        const res = await clockOutRpc({
          data: { sessionId: sid, endReason: reason, accessToken },
        });
        if (res.ok) {
          // Day-end report is the only artifact surfaced on clock-out.
          // Best-effort: its failure must never block the clock-out itself.
          generateDayReportRpc({ data: { accessToken } })
            .then((dr) => {
              if (dr.ok) setLastDayReport(dr.payload);
            })
            .catch((e) => console.warn("day report generation failed", e));
        } else if (res.error) {
          toast.error(res.error);
        }
        clearLocalSession();
        if (reason !== "manual") setPausedReason(reason);
      } catch (e) {
        console.error("clockOut failed", e);
        // Clear local state anyway — resumeOpenSession will re-adopt the row
        // on next load if it is actually still open.
        clearLocalSession();
      } finally {
        stoppingRef.current = false;
        setIsClockingOut(false);
      }
    },
    [clockOutRpc, clearLocalSession, generateDayReportRpc],
  );
  const stopRef = React.useRef(stop);
  React.useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  // Realtime: mirror session changes made from another tab / the Focus page.
  React.useEffect(() => {
    if (!user || !sessionId) return;
    const channel = supabase
      .channel(`work-session-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "study_sessions",
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          const row: any = payload.new;
          if (!row) return;
          if (row.ended_at) {
            clearLocalSession();
            return;
          }
          const paused = row.status === "paused";
          setIsPaused(paused);
          pausedRef.current = paused;
          setPausedAtMs(row.paused_at ? new Date(row.paused_at).getTime() : null);
          if (typeof row.paused_seconds === "number") setPausedSeconds(row.paused_seconds);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, sessionId, clearLocalSession]);

  // Engine: heartbeat + idle detection. One interval, deadline-based warning.
  React.useEffect(() => {
    if (!isClockedIn) return;
    lastEngineTickRef.current = Date.now();
    lastHeartbeatRef.current = Date.now();

    const sendHeartbeat = (now: number) => {
      if (now - lastHeartbeatRef.current < HEARTBEAT_MS) return;
      lastHeartbeatRef.current = now;
      const sid = sessionRef.current;
      if (!sid) return;
      (async () => {
        try {
          const accessToken = await getToken();
          const res = await heartbeatRpc({ data: { sessionId: sid, accessToken } });
          if (!res.ok && /already ended|not found/i.test(res.error ?? "")) {
            // Session was closed elsewhere — sync local state.
            clearLocalSession();
          }
        } catch {
          // Offline / transient — the next beat will retry.
        }
      })();
    };

    const t = window.setInterval(() => {
      const now = Date.now();
      const gap = now - lastEngineTickRef.current;
      lastEngineTickRef.current = now;
      if (!sessionRef.current) return;

      // Woke from a VERY long suspension (laptop slept overnight with the
      // tab open): let the server reconcile — it finalizes the session
      // backdated to the last heartbeat so the sleep never counts as work.
      if (gap > STALE_RECONCILE_MS) {
        lastActivityRef.current = now;
        lastCourseActivityRef.current = now;
        if (warningRef.current) setIdleWarning(null);
        syncRef.current();
        return;
      }

      // Hidden tab, or we just woke from throttle/freeze: that stretch can
      // never count as idle. This kills the wake-up race deterministically —
      // regardless of whether this tick or the visibilitychange handler runs
      // first, the gap itself proves we were suspended.
      // Hidden/suspended tab, OR the trainee is watching a lesson (playing
      // video / focus inside an embedded player iframe) — none of that is idle.
      if (
        document.visibilityState !== "visible" ||
        gap > SUSPEND_GAP_MS ||
        isMediaActive()
      ) {
        lastActivityRef.current = now;
        lastCourseActivityRef.current = now;
        if (warningRef.current) setIdleWarning(null);
        sendHeartbeat(now);
        return;
      }

      sendHeartbeat(now);

      if (pausedRef.current || stoppingRef.current) return;

      // A warning is pending: the ONLY thing that auto-clocks-out is its
      // fixed deadline. Clicking "I'm here" (or any input) clears it first,
      // so the button can never lose a race against the timer.
      const w = warningRef.current;
      if (w) {
        if (now >= w.deadline) {
          stopRef.current(w.kind === "course" ? "auto_idle_course" : "auto_idle_global");
        }
        return;
      }

      const idleFor = now - lastActivityRef.current;
      if (idleFor >= IDLE_MS - WARNING_GRACE_MS) {
        setIdleWarning({ kind: "global", deadline: lastActivityRef.current + IDLE_MS });
        return;
      }
      if (courseWatchersRef.current > 0) {
        const courseIdleFor = now - lastCourseActivityRef.current;
        if (courseIdleFor >= IDLE_MS - WARNING_GRACE_MS) {
          setIdleWarning({
            kind: "course",
            deadline: lastCourseActivityRef.current + IDLE_MS,
          });
        }
      }
    }, CHECK_MS);
    return () => window.clearInterval(t);
  }, [isClockedIn, heartbeatRpc, clearLocalSession]);

  const start = React.useCallback(async () => {
    if (sessionRef.current) return;
    setIsClockingIn(true);
    setPausedReason(null);
    try {
      const accessToken = await getToken();
      const res = await clockInRpc({ data: { accessToken } });
      if (!res.ok) {
        toast.error(res.error || "Could not clock in");
        return;
      }
      if (res.recovered) {
        toast.info("Your previous session ended while you were away — those hours are saved.");
      }
      adoptSession({
        id: res.sessionId,
        startedAt: res.startedAt,
        status: res.status,
        pausedAt: res.pausedAt ?? null,
        pausedSeconds: res.pausedSeconds ?? 0,
      });
      lastHeartbeatRef.current = Date.now();
      toast.success("Clocked in. Work session started.");
    } catch (e) {
      console.error(e);
      toast.error("Failed to clock in");
    } finally {
      setIsClockingIn(false);
    }
  }, [clockInRpc, adoptSession]);

  const pause = React.useCallback(async () => {
    const sid = sessionRef.current;
    if (!sid || pausedRef.current) return;
    setIsPausing(true);
    try {
      const accessToken = await getToken();
      const res = await pauseRpc({ data: { sessionId: sid, accessToken } });
      if (!res.ok) {
        toast.error(res.error || "Could not pause");
        return;
      }
      setIsPaused(true);
      pausedRef.current = true;
      setPausedAtMs(res.pausedAt ? new Date(res.pausedAt).getTime() : Date.now());
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
      setPausedAtMs(null);
      if (typeof res.pausedSeconds === "number") setPausedSeconds(res.pausedSeconds);
      const now = Date.now();
      lastActivityRef.current = now;
      lastCourseActivityRef.current = now;
      toast.success("Resumed. Welcome back.");
    } finally {
      setIsPausing(false);
    }
  }, [resumeRpc]);

  const registerCourseActivity = React.useCallback(() => {
    courseWatchersRef.current += 1;
    lastCourseActivityRef.current = Date.now();

    const reset = () => {
      lastCourseActivityRef.current = Date.now();
    };
    const handlers = ["scroll", "click", "keydown", "touchstart", "mousemove"] as const;
    handlers.forEach((ev) =>
      window.addEventListener(ev, reset, { passive: true } as AddEventListenerOptions),
    );
    return () => {
      courseWatchersRef.current = Math.max(0, courseWatchersRef.current - 1);
      handlers.forEach((ev) => window.removeEventListener(ev, reset));
    };
  }, []);

  const dismissPaused = React.useCallback(() => setPausedReason(null), []);
  const dismissIdleWarning = React.useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastCourseActivityRef.current = now;
    setIdleWarning(null);
    // Refresh liveness immediately so the session reads as fresh.
    const sid = sessionRef.current;
    if (sid) {
      lastHeartbeatRef.current = now;
      getToken()
        .then((accessToken) => heartbeatRpc({ data: { sessionId: sid, accessToken } }))
        .catch(() => {});
    }
  }, [heartbeatRpc]);
  const dismissDayReport = React.useCallback(() => setLastDayReport(null), []);

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
    lastDayReport,
    idleWarning,
    start,
    stop,
    pause,
    resume,
    dismissPaused,
    dismissIdleWarning,
    dismissDayReport,
    registerCourseActivity,
  };

  return <WorkSessionContext.Provider value={value}>{children}</WorkSessionContext.Provider>;
}

export function useWorkSession(): Ctx {
  const ctx = React.useContext(WorkSessionContext);
  if (!ctx) throw new Error("useWorkSession must be used inside WorkSessionProvider");
  return ctx;
}

/** Mount inside a course-page route to enable course-page idle detection. */
export function useCourseInactivityClockOut() {
  const { registerCourseActivity, isClockedIn } = useWorkSession();
  React.useEffect(() => {
    if (!isClockedIn) return;
    return registerCourseActivity();
  }, [registerCourseActivity, isClockedIn]);
}
