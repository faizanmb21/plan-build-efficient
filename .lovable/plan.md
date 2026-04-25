## Plan: Fix the "Something went wrong" screen — no data loss, just a bad role row + a missing error guard

### What I checked first (the important bit)

I queried the database before changing anything. Nothing was deleted:

- **Maaz** is still there — `email: newtest@irmacademy.test`, role `member`, franchise Lahore. ✓
- **All 21 demo members** are still there (Hamza, Ayesha, Bilal, … Arham, Demo Creator (You)). ✓
- **You / test user**: `you@irmacademy.test` → "Demo Creator (You)" → role `member`, franchise PDK. ✓
- **CEO**: `ceo@irmacademy.test` → "Imran Iqbal (CEO)" → role `ceo`. ✓

So no member was deleted. What you're seeing is the generic router error screen ("Something went wrong / Try again / Go home"), and it has two real causes I found in the data + code:

### Real cause #1 — duplicate role on the CEO account (data bug)

The CEO account `ceo@irmacademy.test` (Imran Iqbal) has **two** rows in `user_roles`: `ceo` AND `member`. That's leftover from an earlier seed. It's not breaking by itself today, but it means:
- When the CEO opens any /member URL, the RoleGuard sees `member` in their roles and lets them in (which is why /member previously felt like the CEO got "logged out as member").
- Some queries that key off `roles` array length or "is this user a member" return wrong answers.

I'll delete the stray `member` role row for the CEO. The CEO's `ceo` role is untouched.

There's also a stray profile `Faizan Muhammad` with no role and no franchise (probably created by a real signup attempt). I'll leave that alone — deleting a real auth user is destructive and not something to do without you asking.

### Real cause #2 — CEO dashboard has no error boundary, so any transient failure shows the global "Something went wrong"

`src/routes/ceo.index.tsx` has two `useQuery` calls (`fetchStats`, `fetchOrgScores`). If either throws (network blip, a Supabase RLS hiccup, a transient 500), React Query rethrows into the route, and because `/ceo/` route has **no `errorComponent`**, TanStack Router falls back to the global `defaultErrorComponent` — which is exactly the red-triangle "Something went wrong" screen in your screenshot.

The `fetchOrgScores` query in particular is the likely culprit because:
1. It loads ALL `user_roles` where role = 'member' (now 21 users).
2. It then calls `getPillarScoresForUsers(userIds)` which loads submissions for all of them.
3. If any of those rows trips the RLS path or returns malformed data, the whole query throws and the dashboard goes red.

Fix: wrap each query so a failure renders an inline "couldn't load this section" instead of the whole page. Specifically:
- Add `errorComponent` to the `/ceo/` route so errors show "Couldn't load dashboard. [Retry]" inline, not the full-screen red triangle.
- In the dashboard component, if `statsQuery.error` is set, render the stat row with `—` placeholders + a small retry button (no throw).
- If `scoresQuery.error` is set, render the pillar card with "Couldn't load mastery scores. [Retry]" instead of throwing.
- Same defensive treatment in `fetchOrgScores`: if any sub-query inside `getPillarScoresForUsers` returns an error, return empty scores instead of throwing — so a single bad row never takes down the dashboard.

### Files I'll touch

1. **Database migration** (one-shot data fix):
   ```sql
   -- Remove the duplicate 'member' role on the CEO account
   DELETE FROM public.user_roles
   WHERE user_id = '7e0aace9-7865-402c-b0c4-a5074812000f'
     AND role = 'member';
   ```
   Result: CEO has only `ceo` role. Maaz, you@, and all 20 demo members are untouched.

2. **`src/routes/ceo.index.tsx`** — add `errorComponent` to the route, render per-query error states inline, never throw out of the component.

3. **`src/lib/pillar-data.ts`** — make `getPillarScoresForUsers` swallow per-query errors and return zeros for that pillar instead of throwing the whole function. (Read-only check first — I'll only touch this if it's currently throwing on RLS errors.)

### What I will NOT do

- Won't delete any member, won't touch Maaz, won't touch you@irmacademy.test, won't touch any of the 21 demo accounts.
- Won't delete `Faizan Muhammad` (the orphan profile with no role) without your explicit go-ahead.
- Won't reseed — your existing assignments to Maaz stay exactly as they are.

### How to verify after the fix

1. Refresh /ceo → dashboard loads with stat tiles + pillar flower (no red error screen).
2. Open the CEO browser tab → confirm sidebar still says "CEO" (because the stray `member` role is gone, the role label can never accidentally flip).
3. Log in as Maaz (`newtest@irmacademy.test`) → /member → assigned courses still show under "All" / "Not started" exactly as before.
4. Log in as you@irmacademy.test → /member → still works.
5. Sign in as CEO → /ceo/courses → "View as member" preview opens the in-app dialog and shows the course (no separate sign-in prompt).
