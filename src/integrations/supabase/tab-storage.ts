// Per-tab auth storage adapter for Supabase.
// Uses sessionStorage so each browser tab keeps its OWN session,
// allowing multi-role testing (CEO + Incharge + Member) in one window.
//
// Bootstrap: on first read in a fresh tab, if sessionStorage is empty
// but localStorage has a Supabase auth token, copy it over once so the
// first tab a user opens doesn't feel like a surprise logout.

const BOOTSTRAP_FLAG = "sb-tab-bootstrapped";

function isBrowser() {
  return typeof window !== "undefined";
}

function isSupabaseAuthKey(key: string) {
  return key.startsWith("sb-") && key.includes("-auth-token");
}

function bootstrapFromLocalStorage() {
  if (!isBrowser()) return;
  try {
    if (sessionStorage.getItem(BOOTSTRAP_FLAG)) return;
    sessionStorage.setItem(BOOTSTRAP_FLAG, "1");

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isSupabaseAuthKey(key)) continue;
      if (sessionStorage.getItem(key)) continue;
      const value = localStorage.getItem(key);
      if (value) sessionStorage.setItem(key, value);
    }
  } catch {
    // sessionStorage may be unavailable (private mode, etc.) — ignore
  }
}

let bootstrapped = false;
function ensureBootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  bootstrapFromLocalStorage();
}

export const tabStorage = {
  getItem(key: string): string | null {
    if (!isBrowser()) return null;
    ensureBootstrap();
    try {
      return sessionStorage.getItem(key);
    } catch {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    }
  },
  setItem(key: string, value: string): void {
    if (!isBrowser()) return;
    try {
      sessionStorage.setItem(key, value);
    } catch {
      try {
        localStorage.setItem(key, value);
      } catch {
        // give up silently
      }
    }
  },
  removeItem(key: string): void {
    if (!isBrowser()) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
    // Also clear any stale localStorage copy so signing out in one tab
    // doesn't leave a ghost session that bootstraps into the next new tab.
    try {
      if (isSupabaseAuthKey(key)) localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
