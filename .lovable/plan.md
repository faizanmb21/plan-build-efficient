## Issues to fix

### 1. Inactivity sign-out kicks the CEO out too (cross-tab logout)

What's happening: even though each tab uses its own `sessionStorage` session (`tab-storage.ts`), Supabase's `signOut()` defaults to `scope: 'global'`. That revokes the user's refresh token on the server, so the OTHER tab (CEO) immediately gets `SIGNED_OUT` on its next token refresh and is bounced to /login.

Fix: in `src/hooks/use-inactivity-logout.tsx`, call `supabase.auth.signOut({ scope: 'local' })` instead. This clears only the current tab's session — no other tab/role is affected. The member tab still goes to /login as expected.

### 2. "Claim CEO" card appears on the logout / in-between screen

What's happening: `src/routes/index.tsx` shows the `ClaimCeoCard` whenever a user is authenticated but has no roles. During the brief window after sign-out (session cleared, roles array still being reset, or a stale user with no role row) this card flashes. The user wants it gone entirely.

Fix: remove the `ClaimCeoCard` rendering from `src/routes/index.tsx`. If a logged-in user has no role, just show the "Waiting for an invite" card with a Sign out button — no CEO claim option. (The `ClaimCeoCard` export stays in `ceo.index.tsx` so nothing else breaks; we simply stop rendering it on the index gateway.)

### 3. Lag when switching browser tabs

What's happening: every tab has the inactivity hook running and other listeners. Combined with React Query refetch behavior, tab-switching can stutter. Two cheap wins:

- Inactivity hook listeners use `mousemove` + `scroll` on `window` with no throttle — they fire hundreds of times during normal use. Throttle the activity-reset to once every ~1000ms so React state/timers aren't poked constantly.
- The hook also runs on EVERY page when enabled. Confirm it's only mounted on the lesson player route (it already is — `member.courses.$id.tsx`). Keep that scope; do not add it elsewhere.

Throttle implementation: store `lastActivity.current` and bail out of `reset()` if the previous reset ran less than 1000ms ago AND the warning isn't open. This keeps the timer accurate (still resets every second of activity) without thrashing.

## Files to edit

- `src/hooks/use-inactivity-logout.tsx`
  - Change `supabase.auth.signOut()` → `supabase.auth.signOut({ scope: 'local' })`
  - Add 1s throttle inside `reset()` for passive events (mousemove/scroll); keep keydown/click/touch immediate.
- `src/routes/index.tsx`
  - Remove `<ClaimCeoCard …/>` and its import; keep only the "Waiting for an invite" card for the no-role state.

## Out of scope

- No DB/migration changes.
- No changes to the 3-min idle / 30s warning timing (kept as you set it).
- No change to the per-tab session storage adapter — it already works; the bug was the global sign-out scope undoing it.
