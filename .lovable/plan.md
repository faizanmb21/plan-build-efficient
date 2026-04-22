

## Goal
Allow you to be logged in as **CEO in one tab**, **Incharge in another**, and **Member in a third** — all in the same browser window — without one logging out the others.

## Why this happens today
Supabase stores the auth session in `localStorage`, which is **shared across every tab** in the same browser. So when you log in on tab B, tab A sees the new session on next refresh and effectively "switches" too.

The fix: store the session in **`sessionStorage`** instead. `sessionStorage` is **scoped to a single tab** — each tab keeps its own independent login.

## Plan

### 1. Create a per-tab storage adapter
New file: `src/integrations/supabase/tab-storage.ts`
- Exports a storage object that wraps `sessionStorage` (per-tab) with a fallback to `localStorage` if `sessionStorage` is unavailable.
- Also includes a one-time bootstrap: if a tab opens fresh and `sessionStorage` is empty but `localStorage` has a Supabase session, copy it over **once** so the first tab you open still feels logged in (no surprise logout for existing users).

### 2. Wire the adapter into the Supabase client
File: `src/integrations/supabase/client.ts` (the auto-generated note is just a warning — we have to touch this one line because storage is configured here; no other safe place exists).
- Change `storage: localStorage` → `storage: tabStorage` (imported from the new file).
- Keep `persistSession: true` and `autoRefreshToken: true` so each tab still refreshes its own token.

### 3. Result / how to use it
- Open Tab 1 → log in as **CEO** → use the CEO portal normally.
- Open Tab 2 (same window) → you'll see the login screen → log in as **Incharge** → that tab is now Incharge.
- Open Tab 3 → log in as **Member**. All three tabs stay independently logged in.
- Closing a tab logs **only that tab** out (sessionStorage is cleared with the tab). This is the intended behaviour for multi-account testing.
- "Sign out" button still only signs out the current tab.

### Trade-offs you should know
- Closing or hard-refreshing a tab where the bootstrap copy hasn't happened will require re-login in that tab — this is the price of per-tab isolation.
- "Remember me across browser restarts" only applies to the first tab opened (via the localStorage bootstrap). If you want every tab to survive a browser restart, say so and I'll switch to a different scheme (a per-tab key in localStorage).

### Files touched
- `src/integrations/supabase/tab-storage.ts` (new)
- `src/integrations/supabase/client.ts` (one-line storage swap + import)

### Verification
1. Log in as `ceo@irmacademy.test` in Tab A → land on `/ceo`.
2. Open Tab B (same window) → `/login` appears → log in as `incharge.lahore@irmacademy.test` → land on `/incharge`. Tab A still shows CEO when you switch back.
3. Open Tab C → log in as `newtest@irmacademy.test` (member) → land on `/member`. All three tabs stay independently logged in.
4. Sign out in Tab B → Tabs A and C are unaffected.

