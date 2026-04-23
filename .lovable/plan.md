

## Plan: Projects module (group-assignable, gradable, private per-member)

A new **Projects** section that lives outside courses. Incharge or CEO writes a project brief, assigns it to one or many members (or a whole franchise / everyone), members submit a file, the assigner (or any incharge of that member's franchise / CEO) grades it with the same A+ / A / B / C system used for practical lessons. Each member only ever sees their own submissions and grades.

### Database (one migration)

Two new tables, no changes to existing ones.

**`projects`** — the brief
- `id`, `title`, `description` (long text brief), `attachment_path` (optional, stored in `submissions` bucket), `deadline` (nullable), `created_by`, `franchise_id` (nullable — null = cross-franchise / CEO-wide), `status` (`draft` | `published` | `archived`), `created_at`, `updated_at`

**`project_assignments`** — who has to do it
- `id`, `project_id`, `user_id`, `priority` (`mandatory` | `recommended`), `assigned_by`, `created_at`
- UNIQUE `(project_id, user_id)` so re-assigning is safely idempotent

**`project_submissions`** — what they turned in + the grade
- `id`, `project_id`, `user_id`, `file_url` (storage path in `submissions` bucket), `status` (`pending` | `approved` | `revision`), `letter_grade` (`A+`/`A`/`B`/`C`), `grade` (numeric 0–100), `feedback`, `reviewed_by`, `reviewed_at`, `created_at`
- Mirrors `submissions` table shape so we can reuse all grading utilities

**RLS — strict per-member isolation**
- `projects`: CEO all; incharge SELECT where `franchise_id` is null OR equals their franchise; incharge INSERT/UPDATE only for their own franchise or null; members SELECT only projects they have an assignment for (via EXISTS on `project_assignments`)
- `project_assignments`: CEO all; incharge SELECT/INSERT/DELETE only where the target user is in their franchise (same pattern as `assignments`); members SELECT only their own rows
- `project_submissions`: CEO all; incharge SELECT/UPDATE only where the submission's user is in their franchise; members SELECT/INSERT only their own rows
- Result: a Lahore incharge cannot see Sargodha members' projects, members cannot see each other's submissions.

### New routes / UI

**Incharge side** — `src/routes/incharge.projects.tsx`
- List of projects in this franchise (cards with title, deadline, # assigned, # submitted, # graded)
- "New project" dialog: title, description, optional file attachment, deadline, priority, multi-select members or whole franchise (mirrors `incharge.assign.tsx` UX exactly — same Popover + Command + checkbox pattern)
- Click a project → drawer/dialog showing per-member status (Not submitted / Pending / Graded with letter), with "Review" buttons that open the same grading UI used in `incharge.reviews.tsx` (letter buttons + feedback textarea + optional AI review)

**CEO side** — `src/routes/ceo.projects.tsx`
- Same as incharge but with extra scope picker: "Selected members" / "Whole franchise" / "Everyone" (mirrors `ceo.assign.tsx`)
- Can see and grade across all franchises

**Member side** — `src/routes/member.projects.tsx`
- "My projects" list: each card shows brief, deadline, status badge (Not submitted / Pending review / Graded A/B/C / Needs revision), and "Submit" or "Resubmit" button
- Submit dialog uploads to `submissions` storage bucket under `projects/{user_id}/{project_id}/{timestamp}.{ext}`
- After grade, member sees letter, feedback, and can resubmit if marked C (revision)

**Member grades page (`src/routes/member.grades.tsx`)** — extend, don't replace
- Add a tab/section "Project grades" alongside the existing "Lesson grades" so the member's full graded history is in one place. Reuse `aggregateGrades` from `grade-utils.ts` since the row shape matches.

### Navigation

- Add `{ to: "/incharge/projects", label: "Projects", icon: ClipboardList }` to `src/routes/incharge.tsx` nav
- Add `{ to: "/ceo/projects", label: "Projects", icon: ClipboardList }` to `src/routes/ceo.tsx` nav
- Add `{ to: "/member/projects", label: "Projects", icon: ClipboardList }` to `src/routes/member.tsx` nav

### What we reuse (no rewrites)

- Storage bucket `submissions` (already private with proper policies)
- Letter grade system, colors, aggregation: `src/lib/grade-utils.ts`
- AI review server fn: `src/server/review-submission.ts` — extend it to accept either `submissionId` (lesson) or `projectSubmissionId`
- Multi-select assign UX: copy patterns from `incharge.assign.tsx` and `ceo.assign.tsx`
- Realtime grade toasts: extend `useGradeNotifications` to also subscribe to `project_submissions` updates so members get notified when graded

### Files touched

New:
- `supabase/migrations/<timestamp>_projects.sql` — tables + RLS + indexes
- `src/routes/incharge.projects.tsx`
- `src/routes/ceo.projects.tsx`
- `src/routes/member.projects.tsx`
- `src/lib/project-utils.ts` — small shared helpers (status badges, file upload helper)

Edited:
- `src/routes/incharge.tsx`, `src/routes/ceo.tsx`, `src/routes/member.tsx` — nav entries
- `src/routes/member.grades.tsx` — add Projects tab
- `src/hooks/use-grade-notifications.tsx` — also listen to `project_submissions`
- `src/server/review-submission.ts` — accept project submission id

### Verification

1. Log in as **CEO** → /ceo/projects → create "Brand Reel — April" with brief + PDF attachment, scope "Selected members" → pick 2 members from Lahore + 1 from Sargodha → Assign. Toast "Assigned 3".
2. Log in as **Lahore incharge** → /incharge/projects → see "Brand Reel — April" with 2 assignees (NOT the Sargodha one). Cannot see projects from other franchises.
3. Log in as **Lahore member who got assigned** → /member/projects → see the project, submit a file. Status flips to Pending.
4. Back as Lahore incharge → click the project → see Pending → grade as **A** with feedback. Member gets a realtime toast.
5. Member checks /member/grades → "Project grades" tab now shows the A with feedback, in the same aggregate distribution as lesson grades.
6. Log in as a **member who was NOT assigned** → /member/projects → list is empty (RLS proven). No SQL leak from other tabs.

