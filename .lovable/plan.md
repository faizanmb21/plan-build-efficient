## Goal

Three changes to the grading system:
1. Re-map letter grades to new percentages (A+=90, A=85, B=75, C=0/redo).
2. Show per-course performance as a pie/donut chart for each member (member view) and a complete center for the CEO.
3. Add a "normal template" report export covering all members and incharges with their grades.

---

## 1. New grade scale

Currently: A+=100, A=80, B=60, C=0.
New: **A+=90, A=85, B=75, C=0 (redo)**.

Update the single source of truth + duplicates:
- `src/lib/grade-utils.ts` — `LETTER_TO_PERCENT` and the inline ternary inside `aggregateGrades`.
- `src/components/grading/LessonReviewDialog.tsx` — `LETTER_GRADE_MAP` numeric values + label text + the AI-suggested mapping (`s >= ? "A+" : ...`) thresholds.
- `src/components/grading/ProjectGradeDialog.tsx` — `LETTER_MAP` numeric values.

Historical submissions keep their old `grade` values (won't retroactively change). New gradings use the new scale. Aggregates (averagePercent, passRate) automatically use the new mapping going forward via `letter_grade`.

---

## 2. Pie/donut charts (per-course breakdown)

`recharts` is already installed.

**New component**: `src/components/grading/CourseGradePie.tsx`
- Donut chart showing distribution of A+/A/B/C counts per course OR average % per course.
- Two modes via prop: `mode: "distribution"` (slices = letters) or `mode: "courses"` (slices = course averages with course title labels).
- Color tokens: emerald (A+), sky (A), amber (B), rose (C) — match existing `letterColorClass`.

**Member view** — `src/components/MemberGradeReport.tsx` (also rendered inside member.grades.tsx and ceo drill-in):
- Above the existing "Per-course breakdown" cards, add a 2-column grid:
  - Left: donut of overall letter distribution.
  - Right: donut of average % by course (one slice per course).
- Center label of donut shows total avg % (the "complete center").

**CEO view** — `src/routes/ceo.grades.tsx`:
- In the existing Overview tab add a "Cohort overview" donut: average % per course across all members, with a center showing org-wide average.
- Drill-in dialog already uses `MemberGradeReport`, so member donuts appear there for free.

---

## 3. Report export template (all members + incharges with grades)

**Approach**: Add Excel (.xlsx) export using `xlsx` (SheetJS) — install via `bun add xlsx`. CSV export already exists per-member; this is a roll-up.

**New route**: `src/routes/ceo.grades.report.tsx` already exists for printable; we'll add an "Export full report" button on `ceo.grades.tsx` that generates a multi-sheet workbook:

Sheets:
1. **Summary** — one row per person (members + incharges): Name, Role, Franchise, Total Graded, Avg %, Pass %, A+/A/B/C counts, Last Graded.
2. **Members - Detail** — one row per submission for every member: Member, Franchise, Course, Lesson, Letter, %, Status, Reviewer, Submitted, Graded, Feedback.
3. **By Course** — pivot: rows = members, columns = courses, cells = avg % (with overall column).
4. **Incharges** — list of incharges with their franchise, member count, franchise avg %, pass rate.

Filename: `grades-report-YYYY-MM-DD.xlsx`.

Also keep current per-member CSV export untouched.

A matching PDF "printable" version stays available via the existing `/ceo/grades/report` route — we'll add a "Download PDF" affordance that just uses the browser print dialog (already in place).

---

## Files to change/create

Modify:
- `src/lib/grade-utils.ts` (scale + helper for chart data)
- `src/components/grading/LessonReviewDialog.tsx` (scale + labels)
- `src/components/grading/ProjectGradeDialog.tsx` (scale)
- `src/components/MemberGradeReport.tsx` (add donuts)
- `src/routes/ceo.grades.tsx` (cohort donut + export button)

Create:
- `src/components/grading/CourseGradePie.tsx`
- `src/lib/grade-export.ts` (workbook builder)

Install:
- `xlsx`

No DB migrations. Old `grade` numeric values on past submissions stay as-is; new ones use the new scale.

---

## Open question

Should past submissions be **retroactively re-scored** to the new scale (UPDATE submissions SET grade = new_value WHERE letter_grade = ...)? I'd default to **no** (preserve audit history) unless you confirm yes — let me know in the approval.
