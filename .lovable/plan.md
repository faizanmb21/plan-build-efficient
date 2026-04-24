

## Plan: Fix submission upload + unify submissions/grading view across courses & projects

### Issue 1 — Fix the "row-level security policy" error on member project submit

Root cause: the **storage** bucket `submissions` has an INSERT policy requiring the first folder in the upload path to be the user's UUID (`{userId}/...`). Our project upload helper writes to `projects/{userId}/{projectId}/...`, so the first folder is the literal `"projects"` and storage rejects it.

Fix:
- In `src/lib/project-utils.ts`, change `uploadProjectFile` path from `projects/{userId}/{projectId}/{ts}.{ext}` → `{userId}/projects/{projectId}/{ts}.{ext}`.
- No DB migration needed; existing storage policy already allows `{userId}/...` for any subfolder.

### Issue 2 — Unify submission visibility for Incharge & CEO across BOTH course-lesson "test projects" AND standalone Projects

Root cause: today the CEO sidebar links to `/ceo/submissions` but the route doesn't exist (404 "Not Found"). Course-lesson practical submissions (the `submissions` table — what Maaz uploaded inside the Branding course Lesson 1) are only viewable by **incharges** via `/incharge/reviews`. The CEO has no place to see or grade them. Standalone project submissions live in a separate table and have their own per-project drill-down inside `/incharge/projects` and `/ceo/projects`, but there's no single inbox.

#### A. Create CEO Submissions hub — `src/routes/ceo.submissions.tsx`
Mirror `incharge.reviews.tsx` but scoped CEO-wide (no franchise filter). Tabs:
- **Course practicals** — pulls from `submissions` table (the lesson-level practicals like Maaz's branding submission), enriched with lesson title + course title + member name + franchise name. Filters by status (Pending / Graded / Needs revision) and by franchise. Click → opens the existing `ReviewDialog` (extracted from `incharge.reviews.tsx`) to grade with A+/A/B/C + feedback + optional AI review.
- **Project submissions** — pulls from `project_submissions`, enriched with project title + member + franchise. Click → opens the existing `GradeDialog` (already in `incharge.projects.tsx`).

A single **Counts header** shows Pending/Graded across both types so the CEO sees one inbox.

#### B. Add the same dual-tab inbox for Incharge — extend `src/routes/incharge.reviews.tsx`
Today it only shows course-lesson practicals. Add a second tab "Project submissions" that lists `project_submissions` for members in the incharge's franchise (RLS already allows this), with the same `GradeDialog` to grade. This way the incharge has one place: `/incharge/reviews` for everything that needs grading.

Rename the sidebar label `Reviews` → `Submissions` for consistency with CEO.

#### C. Extract grading dialogs into shared components
Move:
- `ReviewDialog` (lesson practical grading) → `src/components/grading/LessonReviewDialog.tsx`
- `GradeDialog` (project submission grading) → `src/components/grading/ProjectGradeDialog.tsx`

Then `incharge.reviews.tsx`, `incharge.projects.tsx`, `ceo.projects.tsx`, and the new `ceo.submissions.tsx` all import the same dialogs. No behaviour change, just deduplication so future fixes apply everywhere.

#### D. Wire navigation
- CEO sidebar already has "Submissions" → just create the route file so it stops 404'ing.
- Incharge sidebar: rename `Reviews` → `Submissions`.
- Both Member-side flows (course practical via lesson player, standalone project via `/member/projects`) already work — no member changes.

### Result — clear grading flow per type

| What member submits | Where it lives | Who grades it & where |
|---|---|---|
| Practical inside a course lesson (e.g. Branding → Lesson 1 test project) | `submissions` table | Incharge: `/incharge/reviews` → "Course practicals" tab. CEO: `/ceo/submissions` → "Course practicals" tab. |
| Standalone Project assigned via Projects module | `project_submissions` table | Incharge: `/incharge/projects` (per-project drill-down) **OR** `/incharge/reviews` → "Project submissions" tab. CEO: same with `/ceo/projects` and `/ceo/submissions`. |

### Files

New:
- `src/routes/ceo.submissions.tsx`
- `src/components/grading/LessonReviewDialog.tsx`
- `src/components/grading/ProjectGradeDialog.tsx`

Edited:
- `src/lib/project-utils.ts` — storage path fix
- `src/routes/incharge.reviews.tsx` — add Project submissions tab, use shared dialogs
- `src/routes/incharge.projects.tsx`, `src/routes/ceo.projects.tsx` — import shared `ProjectGradeDialog`
- `src/routes/incharge.tsx` — rename nav label to "Submissions"

### Verification

1. As Maaz (member) → /member/projects → submit a PDF to "Ad 1" project → success toast (no RLS error). Status flips to Pending.
2. As CEO → /ceo/submissions → "Project submissions" tab shows Maaz's submission with member + franchise. Open → grade A → save → toast.
3. As CEO → /ceo/submissions → "Course practicals" tab shows Maaz's earlier Branding Lesson 1 submission. Open → grade B with feedback → status flips to Graded.
4. As Lahore incharge → /incharge/reviews → both tabs show only Lahore-franchise members' submissions. Sargodha submissions absent.
5. As Maaz → /member/grades → both new grades visible in Lessons + Projects tabs.

