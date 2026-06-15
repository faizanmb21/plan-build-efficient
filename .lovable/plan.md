# Project assignment fixes

## BUG 1 — Members can't reliably see assigned projects

Root cause is NOT a missing assignment or broken RLS (verified: data + policies are correct). It's two surface bugs:

### Fix 1a — Scope project list to the viewed member during CEO preview
In `src/routes/member.projects.tsx`:
- Pull `viewAsMemberId` from `useAuth()`. When set (CEO previewing), filter the projects query with an explicit `EXISTS`-equivalent via `.in("id", assignedProjectIds)` — i.e. first query `project_assignments` filtered by `user_id = user.id` (which is the overridden id), then load only those projects. This makes the preview match what the real member sees instead of dumping every project the CEO can read.
- Real members are unaffected (RLS already scopes them); we apply the explicit filter unconditionally for safety, since it produces the same result either way.

### Fix 1b — Auto-refresh when a project is assigned
In `src/routes/member.projects.tsx`:
- Add a Supabase realtime subscription on `project_assignments` filtered to `user_id=eq.<me>`; on INSERT/DELETE call `load()`.
- Also re-run `load()` on `window` `focus` and on `document.visibilitychange → visible`, so tabs opened before assignment catch up.

## BUG 2 — Unified CEO project assignments view

In `src/routes/ceo.projects.tsx`:
- Keep the existing cards grid, but add an "All assignments" table above/below it with one row per `project_assignments` entry:
  - Project title
  - Member name
  - Franchise (resolved from member's `profiles.franchise_id`)
  - Assigned by (resolve `project_assignments.assigned_by` → profile name + role badge: CEO / Incharge / QA)
  - Deadline
  - Submission status for that member×project (Not submitted / Pending / Graded / Revision) + letter grade if any
- Extend the `AssignRow` type and `.select(...)` to include `assigned_by, created_at`.
- Fetch the assigner profiles in one batch (`profiles` `.in("id", uniqueAssignerIds)`) and their roles (`user_roles` `.in("user_id", ...)`) so we can show the role badge.
- Add a simple text filter (project/member/franchise) and a status filter dropdown.

QA-assigned projects: QA currently has no INSERT path for `project_assignments` and no UI to create projects, so there's nothing to surface yet. The new table will automatically include QA-assigned rows if/when that capability is added — no extra wiring needed. I will NOT add QA project-assignment capability in this change (out of scope; user only asked to surface them if they exist).

## Files touched
- `src/routes/member.projects.tsx` — preview scoping, realtime + focus refetch.
- `src/routes/ceo.projects.tsx` — unified assignments table, assigner resolution.

No DB migrations, no policy changes.
