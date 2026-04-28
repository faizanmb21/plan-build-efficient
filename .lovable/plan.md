# Keep CEO / Incharge / Member sessions independent across tabs

## The problem

You can sign in as CEO in tab A. The moment you open tab B and sign in as Incharge, tab A "logs out" (or flips to the Incharge user) — and the same happens with Member. You want all three roles open at the same time in different tabs of the same window, with no tab kicking the others out.

## Why it's happening

We already store the session in `sessionStorage` so each tab has its own auth token (see `src/integrations/supabase/tab-storage.ts`). That part works.

The remaining leak is **Supabase's cross-tab broadcast channel**. Internally `supabase-js` uses a `BroadcastChannel` named after the project (e.g. `sb-<ref>-auth-token`) to tell every other tab on the same origin "the user just signed in / signed out / token refreshed." When tab B logs in as Incharge, tab A receives that event and:

1. `onAuthStateChange` fires in tab A with the NEW session (Incharge).
2. Our `AuthProvider` in `src/lib/auth.tsx` overwrites its `session` / `roles` / `profile` state.
3. `RoleGuard` re-evaluates — the CEO tab is now holding an Incharge session, no longer matches `allow={["ceo"]}`, and redirects (looks like a logout).

Per-tab `sessionStorage` does not stop this because the broadcast happens in memory, not via storage.

## The fix

Disable the cross-tab broadcast in the Supabase client so each tab's auth state is fully isolated. This is the supported way to run multiple sessions per browser.

### Change 1 — `src/integrations/supabase/client.ts`

In `createSupabaseClient()`'s `auth` options, disable the broadcast channel:

```ts
auth: {
  storage: typeof window !== 'undefined' ? tabStorage : undefined,
  persistSession: true,
  autoRefreshToken: true,
  // Each tab keeps its OWN session (CEO / Incharge / Member can be open
  // side-by-side). Disable cross-tab sync so signing in or out in one tab
  // does not mutate the auth state of the others.
  broadcastChannel: '',
}
```

Setting `broadcastChannel` to an empty string tells `supabase-js` not to open a `BroadcastChannel`, which is exactly what we want here.

Note: `client.ts` is in the auto-generated header, but the rule is "don't change the imports / exports surface." We're only adjusting the auth options object the file already constructs, which is the documented way to configure multi-tab behavior. If you'd prefer not to touch `client.ts`, the alternative is to ignore broadcast events in `AuthProvider` (see Alternative below) — but the client-level fix is cleaner and one line.

### Change 2 — harden `AuthProvider` (`src/lib/auth.tsx`)

Even with the broadcast disabled, add a small guard so a stray event (e.g. token refresh from another tab on older builds) cannot wipe a valid session:

- In the `onAuthStateChange` handler, ignore events whose `sess?.user.id` differs from the user this tab originally loaded, unless the event is `SIGNED_OUT` triggered locally.
- Track "this tab's user id" in a ref set when `getSession()` resolves and when the user signs in/out from THIS tab via the login form.

This is defensive — the broadcast change alone should solve the symptom, but this prevents regressions.

### Change 3 — verify sign-out only clears the current tab

`signOut()` in `auth.tsx` calls `supabase.auth.signOut()` which by default has `scope: 'local'` in v2 (only this client). Confirm we are not passing `{ scope: 'global' }` anywhere — a global sign-out would invalidate the refresh token used by other tabs and log them all out server-side. A quick grep across `src/` for `signOut(` will confirm. If any call passes `global`, switch it to default/local.

## Alternative (if you'd rather not touch client.ts)

In `src/lib/auth.tsx`, inside the `onAuthStateChange` callback, ignore events that come from another tab:

```ts
const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
  // Ignore cross-tab broadcasts — each tab manages its own session.
  // Only react to events that change THIS tab's session id.
  const currentId = sessionRef.current?.user.id ?? null;
  const nextId = sess?.user.id ?? null;
  if (event !== 'SIGNED_OUT' && currentId && nextId && currentId !== nextId) {
    return;
  }
  // ...existing logic
});
```

This is functionally equivalent for the user-visible bug but keeps `client.ts` untouched.

## How to verify

1. Open tab A → log in as CEO → land on `/ceo`.
2. Open tab B (same window) → log in as Incharge → land on `/incharge`.
3. Switch back to tab A → should still be on the CEO dashboard, still signed in as CEO.
4. Open tab C → log in as a member account → land on `/member`.
5. Switch through A / B / C → each tab keeps its own role, sidebar label, and data. No tab redirects to login.
6. Sign out in tab B → tabs A and C remain signed in.

## Files touched

- `src/integrations/supabase/client.ts` — add `broadcastChannel: ''` to auth options.
- `src/lib/auth.tsx` — guard `onAuthStateChange` against foreign user ids; verify no `signOut({ scope: 'global' })` calls anywhere in `src/`.

No database changes, no route changes, no UI changes.
