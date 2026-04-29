## Goal

Kill the 12-pillar "flower" everywhere it still appears and replace it with a single, consistent grade-percentage visualization. Every dashboard — CEO home, CEO franchises grid, CEO franchise detail, member home, and (already done) incharge dashboard — will speak the same language: **letter-grade pies (A+ / A / B / C) and an average %**, computed from `submissions.letter_grade`.

## Why

The flower shows lesson-completion across 12 abstract pillars. The grading system you actually use is A+ (90), A (85), B (75), C (redo / 0). Two unrelated mental models on the same screen confused you twice already. From now on, performance = letter-grade mix + average %.

## What gets removed

- `src/components/PillarFlower.tsx` — delete file.
- `src/lib/pillar-data.ts` — delete file.
- `src/lib/pillars.ts` — delete file (no other consumers).
- All `PillarFlower` / `getPillarScoresForUsers` / `PillarScores` imports and JSX in:
  - `src/routes/ceo.index.tsx`
  - `src/routes/ceo.franchises.index.tsx`
  - `src/routes/ceo.franchises.$id.tsx`
  - `src/routes/member.index.tsx`

(`src/routes/incharge.index.tsx` is already done from last turn.)

## What replaces it

A small shared helper + the existing `CourseGradePie` donut.

### New helper: `src/lib/grade-summary.ts`

One function: `fetchGradeSummaries(userIds: string[])`. Pulls `submissions` (id, user_id, status, letter_grade, grade, reviewed_at) for those users in one query and returns:

```ts
Map<string /* userId */, GradeAggregate>  // from grade-utils
```

Plus `aggregateMany(rows)` to roll an arbitrary set of rows into one `GradeAggregate`. Used everywhere we need org-wide / franchise-wide totals.

### New component: `src/components/grading/GradePieCard.tsx`

A self-contained card — donut + average %, total count, pass rate, and a 4-chip A+/A/B/C legend underneath. Takes `{ title, agg, size? }`. Used on every dashboard so the look is identical.

## Per-page changes

### 1. `src/routes/ceo.index.tsx` (CEO home)

Replace the "12-pillar mastery" Card with an **"Academy performance"** Card containing one big `GradePieCard` (org-wide, all members across all franchises). Add a small grid below it with one mini `GradePieCard` per franchise so the CEO sees franchise-by-franchise performance at a glance. Stat tiles unchanged.

### 2. `src/routes/ceo.franchises.index.tsx` (Franchises grid)

In each franchise card, replace the small flower with a small `GradePieCard` (size ~140) showing that franchise's average % in the donut center, plus member count below it (already there). The "Click for more details" CTA stays.

### 3. `src/routes/ceo.franchises.$id.tsx` (Franchise detail)

- Top "Franchise mastery" card → **"Franchise grades"** card with one large donut + average % + pass rate, and a stacked horizontal bar showing the A+/A/B/C breakdown.
- Per-member cards: replace the inline 150px flower with a 130px `GradePieCard` (no title — the member name is already in the card header). Keep the existing course-progress and attendance tiles untouched.
- Remove `PILLARS`, `PillarScores`, `EMPTY_SCORES`, `scoresForUser`, and the entire pillar lessons-by-course resolution block (lines ~123–151, ~215–225, ~270–275). Per-member `scores` field on `MemberDetail` becomes `gradeAgg: GradeAggregate`.

### 4. `src/routes/member.index.tsx` (Member home)

The right-rail "Skill mastery" card becomes "**My grades**":
- Donut of A+/A/B/C from this member's own submissions.
- Center = their average %.
- Below: "X graded · pass rate Y%" and the existing "View grade report" button.
- Drop `pillarScores`, `getPillarScoresForUsers`, `PillarFlower` imports.

### 5. `src/routes/incharge.index.tsx`

Already pies. No change.

## Files touched

- **delete**: `src/components/PillarFlower.tsx`, `src/lib/pillar-data.ts`, `src/lib/pillars.ts`
- **create**: `src/lib/grade-summary.ts`, `src/components/grading/GradePieCard.tsx`
- **edit**: `src/routes/ceo.index.tsx`, `src/routes/ceo.franchises.index.tsx`, `src/routes/ceo.franchises.$id.tsx`, `src/routes/member.index.tsx`

## Sanity check after build

After the edits I'll grep for any leftover `PillarFlower`, `PillarScores`, `pillar-data`, or `@/lib/pillars` imports — if any survive, the build will break, so they must all be gone.

## One small open call

For the CEO home "per-franchise mini pie" grid: should each mini pie be **clickable** and link to that franchise's detail page? I think yes (matches the existing stat tiles which are all links) — I'll do that unless you want them static.
