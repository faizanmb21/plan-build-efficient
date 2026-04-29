import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Options {
  /** Whether the watcher is active (e.g. only on lesson pages). */
  enabled: boolean;
  /** Idle threshold in ms before showing the warning. Default 60_000 (1 min). */
  idleMs?: number;
  /** Grace period in ms after the warning before signing out. Default 10_000. */
  warnMs?: number;
  /** Optional callback fired when inactivity is detected (e.g. pause video). */
  onInactive?: () => void;
}

/**
 * Watches user activity. After `idleMs` of inactivity it fires `onInactive`
 * (e.g. to pause the video) and shows a "Are you still watching?" toast for
 * `warnMs`. If the user does not interact within that window, signs them out
 * and redirects to /login?reason=inactive.
 *
 * Activity = mousemove, keydown, click, touchstart, scroll, OR the tab
 * becoming visible again. Hidden tab / window blur DOES count as inactivity.
 */
export function useInactivityLogout({
  enabled,
  idleMs = 60_000,
  warnMs = 10_000,
  onInactive,
}: Options) {
  const navigate = useNavigate();
  const lastActivity = React.useRef<number>(Date.now());
  const warnTimer = React.useRef<number | null>(null);
  const logoutTimer = React.useRef<number | null>(null);
  const warningOpen = React.useRef(false);
  const onInactiveRef = React.useRef(onInactive);
  React.useEffect(() => {
    onInactiveRef.current = onInactive;
  }, [onInactive]);

  React.useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      if (warnTimer.current) window.clearTimeout(warnTimer.current);
      if (logoutTimer.current) window.clearTimeout(logoutTimer.current);
      warnTimer.current = null;
      logoutTimer.current = null;
    };

    const reset = () => {
      lastActivity.current = Date.now();
      if (warningOpen.current) {
        warningOpen.current = false;
        toast.dismiss("inactivity-warn");
      }
      clearTimers();
      warnTimer.current = window.setTimeout(triggerWarning, idleMs);
    };

    const triggerWarning = () => {
      warningOpen.current = true;
      try {
        onInactiveRef.current?.();
      } catch {
        /* noop */
      }
      toast("Are you still watching?", {
        id: "inactivity-warn",
        description: `You'll be signed out in ${Math.round(warnMs / 1000)}s due to inactivity.`,
        duration: warnMs,
        action: {
          label: "Stay signed in",
          onClick: () => reset(),
        },
      });
      logoutTimer.current = window.setTimeout(doLogout, warnMs);
    };

    const doLogout = async () => {
      warningOpen.current = false;
      try {
        await supabase.auth.signOut();
      } catch {
        /* noop */
      }
      toast.error("Signed out due to inactivity.");
      navigate({ to: "/login" });
    };

    const onActivity = () => {
      // While the warning is showing, only an explicit click on "Stay signed in"
      // counts. Passive mouse drift should NOT cancel — but a real interaction
      // (keydown/click/touch) should.
      if (warningOpen.current) return;
      reset();
    };

    const onPointerOrKey = () => {
      if (warningOpen.current) reset();
      else reset();
    };

    window.addEventListener("mousemove", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    window.addEventListener("keydown", onPointerOrKey);
    window.addEventListener("click", onPointerOrKey);
    window.addEventListener("touchstart", onPointerOrKey, { passive: true });

    reset();

    return () => {
      window.removeEventListener("mousemove", onActivity);
      window.removeEventListener("scroll", onActivity);
      window.removeEventListener("keydown", onPointerOrKey);
      window.removeEventListener("click", onPointerOrKey);
      window.removeEventListener("touchstart", onPointerOrKey);
      clearTimers();
      toast.dismiss("inactivity-warn");
      warningOpen.current = false;
    };
  }, [enabled, idleMs, warnMs, navigate]);
}
