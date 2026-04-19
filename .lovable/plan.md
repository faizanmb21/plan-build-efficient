

User wants the existing grading system populated with realistic seed data so they can see it working end-to-end across all three roles (member, incharge, CEO) without manually clicking through grading flows. Combined with the previous plan, this becomes: build the CEO grades hub AND seed enough graded submissions to make every view non-empty.

## Plan

### Part A — Seed graded submission data

Extend `seed_demo_content()` (the existing SQL seeder, runnable from `/ceo/seed`) to populate **letter-graded submissions across every member, every pillar course**, so member/incharge/CEO views all light up immediately.

What gets seeded (idempotent — only inserts where rows don't already exist):
- For **each of the 21 members**, across **all 12 pillar courses**, insert ~3 practical submissions per member (covering different lessons), with a realistic mix:
  - ~40% **A** (80%, approved)
  - ~25% **A+** (100%, approved)
  - ~20% **B** (60%, approved)
  - ~10% **C** (revision / redo)
  - ~5% **pending** (awaiting incharge review)
- Each graded row gets: `letter_grade`, numeric `grade`, realistic `feedback` text (rotating from a small bank of ~8 phrases per outcome), `reviewed_by` set to the member's franchise incharge, `reviewed_at` randomized across the last 30 days.
- For every approved submission, also upsert `lesson_progress` (`completed: true`, `progress_percent: 100`) so the member's course progress bars advance.
- For every C/revision submission, leave `lesson_progress.completed = false` so the redo flow is visible.

Result after running the seeder once: ~750 graded submissions with realistic distributions, spread across 3 franchises and 12 pillars.

### Part B — CEO grading overview hub `/ceo/grades`

New file `src/routes/ceo.grades.tsx` with three tabs:
- **By member** — every member's name, franchise, total graded, A+/A/B/C counts, average %, redo count, last graded. Sortable + searchable + franchise filter. Click row → per-member drill-down dialog.
- **By franchise** — per-franchise totals: members, submissions graded, average %, mini grade-distribution bar.
- **By course (pillar)** — per-pillar totals: graded, average %, pass rate, redo rate.

Each row: "View details" → drawer showing per-course breakdown + full submission timeline.
Each table: "Download CSV" button (built client-side, no new dependency).

### Part C — Per-member grade drill-down (shared component)

`src/components/MemberGradeReport.tsx` — used by `/ceo/grades` and from the existing `/ceo/franchises/$id` member cards (add a small "View grades" button there).
- Header: name, franchise, average %, total graded.
- Per-pillar breakdown grid (12 pillars, avg %, count, latest letter).
- Submission timeline with letter, %, feedback, reviewer, date.
- "Open printable report" → new tab to `/ceo/grades/report?member=...` for browser print-to-PDF.

### Part D — Printable report route

`src/routes/ceo.grades.report.tsx` — minimal print-styled layout, supports `?scope=member|franchise|course&id=...`. Calls `window.print()` on mount. No native PDF library (avoids Worker runtime issues).

### Part E — Sidebar link

`src/components/AppShell.tsx` — add "Grades" entry under the CEO nav pointing to `/ceo/grades`.

### Files touched

- `supabase/migrations/<new>.sql` — replace `seed_demo_content()` body with the extended version that populates letter-graded submissions + lesson_progress.
- `src/routes/ceo.grades.tsx` — new hub.
- `src/routes/ceo.grades.report.tsx` — new printable view.
- `src/components/MemberGradeReport.tsx` — new shared drill-down.
- `src/routes/ceo.franchises.$id.tsx` — add "View grades" button per member card.
- `src/components/AppShell.tsx` — add Grades nav link.
- `src/lib/grade-utils.ts` — letter→numeric, aggregation helpers, CSV builder.

### Verification flow (after approving + running seeder once from `/ceo/seed`)

1. Log in as `member01@irmacademy.test` → `/member/grades` shows ~36 graded items with letter grades, feedback, mix of pass/redo. Course progress bars are partially full.
2. Log in as `incharge.sargodha@irmacademy.test` → `/incharge/reviews` shows the small set of pending submissions plus a history of already-graded ones.
3. Log in as `ceo@irmacademy.test` → `/ceo/grades` shows all three tabs populated with real distributions; click any member → drill-down with full per-pillar breakdown; CSV download works; printable report opens.
4. `/ceo/franchises/{id}` → each member card has a "View grades" button opening the same drill-down.

