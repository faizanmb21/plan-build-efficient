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
//   browser is only a display + liveness beacon. Tab switching, background
//   throttling, freezing, or closing the tab can never corrupt the clock —
//   it keeps running server-side until an explicit clock-out.
// - There is NO idle timer. The session runs until the member clocks out (or
//   pauses). The only automatic closure is the server's stale sweep: an open
//   session whose last heartbeat is >30 min old (tab closed, laptop shut) is
//   finalized BACKDATED to that heartbeat, so hours stay accurate.
// ---------------------------------------------------------------------------

const HEARTBEAT_MS = 30 * 1000; // liveness ping cadence
const CHECK_MS = 15 * 1000; // engine tick
// Wake-ups after very long suspensions (laptop slept overnight with the tab
// open) go through a full server reconcile: the server finalizes the session
// backdated to its last heartbeat. Mirrors STALE_SESSION_MS on the server.
const STALE_RECONCILE_MS = 30 * 60 * 1000;

export type ClockOutReason = "manual" | "auto_idle_global" | "auto_idle_course";

interface Ctx {
  sessionId: string | null;
  startedAt: number | null;
  activeSeconds: number;
  isClockedIn: boolean;
  isPaused: boolean;
  isClockingIn: boolean;
  isClockingOut: boolean;
  isPausing: boolean;
  lastDayReport: DayReportPayload | null;
  start: () => Promise<void>;
  stop: (reason?: ClockOutReason) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  dismissDayReport: () => void;
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
  const [lastDayReport, setLastDayReport] = React.useState<DayReportPayload | null>(null);

  const sessionRef = React.useRef<string | null>(null);
  const pausedRef = React.useRef<boolean>(false);
  const stoppingRef = React.useRef<boolean>(false);
  const lastEngineTickRef = React.useRef<number>(Date.now());
  const lastHeartbeatRef = React.useRef<number>(0);

  const isClockedIn = !!sessionId;

  React.useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  // Derived display time — pure function of server timestamps + wall clock.
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
      lastEngineTickRef.current = Date.now();
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

  const stop = React.useCallback(
    async (reason: ClockOutReason = "manual") => {
      const sid = sessionRef.current;
      if (!sid || stoppingRef.current) return;
      stoppingRef.current = true;
      setIsClockingOut(true);
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

  // Engine: liveness heartbeat + long-suspension reconcile. No idle timers.
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
        syncRef.current();
        return;
      }

      sendHeartbeat(now);
    }, CHECK_MS);
    return () => window.clearInterval(t);
  }, [isClockedIn, heartbeatRpc, clearLocalSession]);

  const start = React.useCallback(async () => {
    if (sessionRef.current) return;
    setIsClockingIn(true);
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
      toast.success("Session paused.");
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
      toast.success("Resumed. Welcome back.");
    } finally {
      setIsPausing(false);
    }
  }, [resumeRpc]);

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
    lastDayReport,
    start,
    stop,
    pause,
    resume,
    dismissDayReport,
  };

  return <WorkSessionContext.Provider value={value}>{children}</WorkSessionContext.Provider>;
}

export function useWorkSession(): Ctx {
  const ctx = React.useContext(WorkSessionContext);
  if (!ctx) throw new Error("useWorkSession must be used inside WorkSessionProvider");
  return ctx;
}
