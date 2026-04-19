

## Plan: Fix the Incharge portal (4 issues)

### Issue 1 — Members page shows no real details

**Cause**: `incharge.members.tsx` only renders `full_name` + `phone`. Email, join date, course progress, and grade summary are missing, so the page feels empty.

**Fix**: Enrich the active members card. For each member, show:
- Avatar + full name + email (from `auth.users` via a small RPC, since we can't read auth directly with RLS)
- Phone (if present)
- Join date (`profiles.created_at`)
- Quick stats: courses assigned, lessons completed, last seen (from `study_sessions.last_heartbeat_at`)
- "View report" button → opens the existing `MemberGradeReport` dialog (same one used on grades page)

Add a new `SECURITY DEFINER` RPC `get_franchise_member_emails(_franchise_id uuid)` that returns `(user_id, email)` pairs after verifying the caller is the incharge of that franchise (or a CEO). This avoids exposing auth.users broadly.

### Issue 2 — Grades "By member" tab shows 0 members

**Root cause** (this is the real bug): `incharge.grades.tsx` builds `memberRoleIds` by querying `user_roles` for `role='member'`. But the RLS policy on `user_roles` is `users read own roles` — an incharge can only read their OWN role. So `memberRoleIds` is always empty for an incharge → `memberRows` filters everyone out → table shows "No members in your franchise yet" and the **Members** summary tile reads **0**.

**Fix**: Two options, picking the simple+correct one:

- Drop the `user_roles` lookup entirely in `incharge.grades.tsx`. The `profiles` query is already filtered to `franchise_id = caller's franchise` (and incharge RLS only lets them see their franchise's profiles anyway). Treat every profile in their franchise *except themselves* as a member. Update `memberRows` and the `totals.totalMembers` calc accordingly.

This also fixes the by-pillar "Members graded" column being correct while the by-member tab was empty.

### Issue 3 — Attendance is completely empty

**Cause**: The demo seeder (`seed_demo_content`) does not insert any `study_sessions` or `attendance_snapshots`. Real members would generate them by clocking in on Focus, but seeded members never have.

**Fix**: Extend `seed_demo_content` to insert ~7 days of synthetic `study_sessions` per member (2-3 sessions/day, varied active/idle seconds, some with `ended_at = null` to simulate "live"), plus a handful of `attendance_snapshots` rows pointing at a placeholder image path. Now the Incharge attendance page and CEO rollup will show realistic numbers immediately after re-running the seeder.

### Issue 4 — Incharge can't assign courses

**Cause**: The `/ceo/assign` page exists but is CEO-only via `RoleGuard`. There's no incharge equivalent.

**Fix**: Add `src/routes/incharge.assign.tsx` — a scoped clone of the CEO assign page that:
- Lists all **published** courses (read-only, can't create/delete courses)
- Lets the incharge assign to **a single member of their franchise** or **the entire franchise** (no "Everyone" option)
- Shows recent assignments scoped to their franchise members only
- Allows deleting an assignment they made (or any assignment to one of their members)

Add nav entry in `src/routes/incharge.tsx`:
```
{ to: "/incharge/assign", label: "Assign courses", icon: Send }
```

RLS check: The current `assignments` table policies only allow `ceo all assignments` and `users read own assignments`. We need to add:
- `incharge insert assignments for franchise members` (INSERT WITH CHECK that the target user_id belongs to the incharge's franchise)
- `incharge read franchise assignments` (already exists ✓)
- `incharge delete franchise assignments` (DELETE USING franchise membership)

### Files to change
- `src/routes/incharge.members.tsx` — enriched member cards + report dialog
- `src/routes/incharge.grades.tsx` — drop the broken `user_roles` filter
- `src/routes/incharge.tsx` — add "Assign courses" nav item
- `src/routes/incharge.assign.tsx` — **new** scoped assignment page
- DB migration — new RPC `get_franchise_member_emails`, two new RLS policies on `assignments`, extended `seed_demo_content` with study sessions

### Verification after build
1. Log in as `incharge.lahore@irmacademy.test` / `Academy@123`
2. **Members**: see 7 enriched member cards with email + stats + "View report" working
3. **Grades**: "By member" tab shows the 7 Lahore members with their grade distributions
4. **Assign courses** (new sidebar item): pick a course → "Whole franchise" → Assign → see new rows in Recent
5. Re-run seeder once at `/ceo/seed` (CEO), then **Attendance** shows hours per Lahore member

