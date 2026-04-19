

## Plan: Course tab fixes + per-lesson letter grading

### 1. Courses index — fixed-size thumbnails with fallback
File: `src/routes/ceo.courses.index.tsx`
- Add a thumbnail block at the top of each course card, locked to a fixed `aspect-video` (16:9) with `object-cover`, so every card looks uniform regardless of image dimensions.
- When `thumbnail_url` is null, show a neutral placeholder (icon + course initial on `bg-muted`) at the same aspect ratio.
- Card body stays the same; only the visual header changes.

### 2. Course editor — make Status save reliably + quick toggle
File: `src/routes/ceo.courses.$id.edit.tsx`
- The Save details button already updates `status` via `saveMeta()`; user feedback says it's "not doing that yet." Two improvements:
  - Add a **prominent status switch** in the page header next to the badge that auto-saves on change (no need to scroll to "Save details"). Optimistically updates the local card and writes `status` to `courses` immediately, with a success toast and revert on error.
  - Keep the existing Status dropdown in "Course details" but make Save details show a clearer success toast like "Course details saved".
- No DB change required.

### 3. Per-lesson letter grading (A+ / A / B / C)
Goal: when a member submits a practical, the incharge picks a letter grade. A+/A/B = pass (lesson marked complete); C = redo (submission goes to `revision` so the member resubmits). A+ = 100%, A = 80%, B = 60%, C triggers re-do.

DB migration:
- Add `letter_grade text` column to `public.submissions` (nullable). Numeric `grade` stays for backward compat and we'll auto-fill it from the letter (100 / 80 / 60 / 0).
- No new table; "redo" reuses existing `submission_status = 'revision'`.

Incharge review UI — `src/routes/incharge.reviews.tsx` and `src/server/review-submission.ts`:
- Replace the freeform numeric grade input in the review dialog with a 4-button letter selector (A+, A, B, C). Selecting C automatically sets status = `revision`; A+/A/B set status = `approved` and write the corresponding numeric grade.
- On approve (A+/A/B): also upsert `lesson_progress` for that member+lesson with `completed = true`, `progress_percent = 100`, so the "redo" cycle ends and the lesson is officially passed.
- On C (redo): leave/clear `lesson_progress.completed` for that lesson so the member sees it as outstanding again, and the practical re-appears as needing a new submission.

Member side — `src/routes/member.courses.$id.tsx` (PracticalSubmit):
- Show the latest letter grade and feedback under "Last submission" (e.g. "Grade: A — passed" or "Grade: C — please redo").
- If status is `revision`, the existing "Resubmit" button already handles re-upload; no other change needed.

### 4. End-to-end verification
- Courses tab: every card shows an image area of identical size; cards without uploads show the placeholder.
- Course editor: flip status with the header switch → reload page → status persists. Save details still works for title/desc/thumbnail.
- Submit a practical as a member → as incharge, grade it C → member sees "Redo" and can resubmit. Grade the next attempt A → member sees lesson marked complete, course progress advances.

### Files touched
- `src/routes/ceo.courses.index.tsx` — fixed-size thumbnail block on cards.
- `src/routes/ceo.courses.$id.edit.tsx` — header status switch with auto-save.
- `src/routes/incharge.reviews.tsx` — letter-grade buttons, lesson_progress upsert on pass.
- `src/server/review-submission.ts` — accept letter grade, derive numeric + status, mark lesson_progress on pass.
- `src/routes/member.courses.$id.tsx` — show letter grade in submission summary.
- New migration: add `letter_grade text` to `public.submissions`.

