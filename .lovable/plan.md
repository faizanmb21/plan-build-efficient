## Root cause

Verified Rumesa's grade lives in `project_submissions` (status=`approved`, grade=`85`, letter_grade=`A`). The CEO dashboard's grade aggregation reads **only the `submissions` table** (lesson submissions). Project grades — stored in the structurally identical `project_submissions` table — are completely excluded from every CEO grade view.

Evidence (all use `aggregateGrades(...)` over rows fetched from `submissions` only):
- `src/routes/ceo.index.tsx` — `fetchOrgPerformance` (KPI "Avg Grade Score", franchise donut, per-member rows in the strip, attention table, incharge scorecard, course rollups).
- `src/lib/grade-summary.ts` — `fetchUserAggregates` / `fetchMemberAggregate`.
- `src/routes/ceo.grades.tsx` and `src/routes/ceo.grades.report.tsx`.
- `src/components/MemberGradeReport.tsx`.
- `src/lib/member-progress.ts` — `RosterTable` "Avg Grade" column reads `submissions.grade` only.

Schemas confirmed identical (`status`, `letter_grade`, `grade`, `feedback`, `reviewed_*`, `created_at`), so the fix is to fetch both tables and merge before aggregating. Projects have no `course_id`, so per-course rollups stay lesson-only; everything else (org / franchise / member / letter-distribution / averages) merges both.

## Plan

### 1. Broaden the shared `GradedRow` type
`src/lib/grade-utils.ts`:
- Make `lesson_id: string | null` and add optional `project_id: string | null`.
- No change to `aggregateGrades` logic — it already only reads `status` / `letter_grade` / `reviewed_at`.

### 2. Add one shared fetch helper
New `src/lib/all-grades.ts` exporting `fetchAllGradedRows(userIds: string[]): Promise<GradedRow[]>` which:
- Fetches `submissions` and `project_submissions` in parallel with the same column projection.
- Normalizes each into `GradedRow` (lesson rows get `project_id: null`, project rows get `lesson_id: null`).
- Returns the concatenated array.

Also export `fetchAllGradedRowsForMember(userId)` for the single-member views.

### 3. Wire it into every aggregation site

| File | Change |
|---|---|
| `src/routes/ceo.index.tsx` (`fetchOrgPerformance`) | Replace the single `submissions` fetch with `fetchAllGradedRows(memberIds-or-all)`. Build `subsByUser` / `aggByUser` from combined rows. `pendingTotal` and `oldestPendingDays` count both. Per-course `rowsByCourse` still uses only rows with `lesson_id` (projects have no course). Incharge `reviewedByThem` / `pendingHere` use combined rows. |
| `src/lib/grade-summary.ts` | `fetchUserAggregates` and `fetchMemberAggregate` use the new helper instead of `.from("submissions")`. |
| `src/routes/ceo.grades.tsx` | Replace `submissions` query with the helper; keep existing per-franchise / per-member grouping. The "Members graded" stat counts distinct users from combined rows. |
| `src/routes/ceo.grades.report.tsx` | Same swap; report table now lists project rows too (label "Project" vs "Lesson" via the source flag — minor UI tweak to the title cell only if a lookup is cheap; otherwise leave unlabeled to keep this change minimal). |
| `src/components/MemberGradeReport.tsx` | Same swap; per-course grouping continues to use `lesson_id` only, and we add a separate "Projects" group built from the project rows so they're visible in the breakdown. |
| `src/lib/member-progress.ts` | `fetchRoster` and `fetchMemberDetail` already fetch `project_submissions` for `pendingQa`. Extend the existing loops to also accumulate `grade` from project rows into `gradeSum` / `courseGrade`-equivalent — so the roster "Avg Grade" column and member detail KPI include project grades. |

### 4. Out of scope (intentionally not touched)
- Per-course rollups (`courses` table on the dashboard) stay lesson-only because projects have no `course_id`.
- Incharge / QA / member-side grade views — only the user-reported CEO surfaces are in scope. (If you want incharge/member views updated too, say so and I'll extend.)

### 5. Verification
After the change, re-query the dashboard data layer mentally against Rumesa's row: combined fetch returns her project row (`letter_grade='A'`, grade=85), so:
- KPI "Avg Grade Score" includes 85.
- Her franchise's donut + her member row both show an A bucket count of ≥1.
- A+/A/B/Redo distribution shows the A.
- `ceo.grades` table lists her project grade and `MemberGradeReport` for Rumesa shows the project row.

No schema or RLS changes needed — `project_submissions` already has CEO-readable RLS (it's used in `ceo.submissions.tsx` today).
