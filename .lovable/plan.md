## Findings

- Rumesa exists in `profiles` and her graded work is stored in `project_submissions`:
  - project: `Test Week 2 progress`
  - status: `approved`
  - `grade`: `85`
  - `letter_grade`: `A`
- The grade format is the same shape as lesson submissions: `submissions.grade` / `project_submissions.grade` are numeric percentages, and both tables also store `letter_grade`.
- The failing CEO grade surfaces were caused by aggregation paths reading only lesson `submissions`, so project grades were excluded from:
  - Avg Grade Score KPI
  - franchise grade donut/distribution
  - per-member grade bars
  - CEO Grades page/member report
- This does not appear to be an RLS/franchise scoping issue: the row is present and CEO-readable; it was excluded by app aggregation logic.

## Fix plan

1. **Use a combined grade source everywhere CEO grade data is aggregated**
   - Fetch both `submissions` and `project_submissions`.
   - Normalize both into one `GradedRow[]` with `source: "lesson" | "project"`, nullable `lesson_id`, and nullable `project_id`.

2. **Update all CEO-facing aggregation paths**
   - `src/routes/ceo.index.tsx`: org KPI, franchise donut, member rows, letter distribution, incharge/member blocks.
   - `src/routes/ceo.grades.tsx`: member/franchise tables and drilldowns.
   - `src/routes/ceo.grades.report.tsx` and `src/components/MemberGradeReport.tsx`: include projects in reports.
   - `src/lib/grade-summary.ts` and `src/lib/member-progress.ts`: shared member/franchise average helpers.

3. **Bucket grades consistently**
   - Prefer stored `letter_grade` when present.
   - If a project/lesson row has only numeric `grade`, map percentage to buckets:
     - `>= 90` → `A+`
     - `>= 80` → `A`
     - `>= 60` → `B`
     - `< 60` or `revision` → `Redo / C`
   - Average score should use the numeric `grade` when present; otherwise fall back from letter grade.

4. **Keep course rollups safe**
   - Lesson rows can map to courses through `lesson_id`.
   - Project rows have no course mapping, so they should appear under a separate `Projects` bucket in reports rather than being dropped from overall/member/franchise totals.

5. **Verify after implementation**
   - Reload `/ceo`: Rumesa’s 85/A project affects Avg Grade Score, franchise donut, her member row, and A distribution.
   - Reload `/ceo/grades`: project grade appears in CEO grade reporting.
   - Confirm no runtime errors from nullable `lesson_id` handling.
