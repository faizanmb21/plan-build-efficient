
## Goals

Bring the QA reviewer experience up to the same quality bar as the CEO dashboard, scoped to the franchises the QA is assigned to (via `qa_franchise_assignments`, which RLS already enforces).

Two pages get the redesign:

1. `/qa` — Dashboard (franchise + member progress overview)
2. `/qa/submissions` — Review workspace (clean grading queue)

---

## 1. QA Dashboard (`src/routes/qa.index.tsx`)

Mirror the CEO dashboard's information architecture, scoped to assigned franchises.

**Layout:**

```text
┌─ Header: "QA Review · {QA name}" + month label ────────────┐
├─ KPI strip (4 tiles) ──────────────────────────────────────┤
│  Members in scope | Avg completion | Avg grade | Pending   │
├─ Franchise overview (grid of cards, 1-3 cols) ─────────────┤
│  Per franchise: grade-distribution pie, A+/A/B/Redo legend,│
│  incharge name, member count, member roster (clickable).   │
│  Clicking a member opens MemberGradeReport dialog.         │
├─ Members needing attention (table) ────────────────────────┤
│  Low avg / overdue / stale activity — sorted by issue count│
└────────────────────────────────────────────────────────────┘
```

**Reuses (no new components needed):**
- `KpiTile`, `MiniAvatar`, `GradeDistributionBar` from `ProgressPrimitives`
- `InchargeMemberStrip` + `InchargeBlock` from `components/ceo/InchargeMemberStrip`
- `MemberGradeReport` for the click-through member dialog
- `aggregateGrades`, `combineAggregates`, `computeMemberRisk`, `fetchCompletionSummary`, `fetchOverdueCounts`

**Data fetch:** A new `fetchQaPerformance()` function (mirrors `fetchOrgPerformance`) but scoped to the QA's assigned franchises only. RLS handles enforcement — we just iterate over rows returned. No need for "incharge scorecards" or "courses" tables (those are CEO-only concerns).

**Differences from CEO version:**
- No archive/restore/purge actions on franchise cards (pass `onArchive` undefined)
- No "Submissions admin" or "Manage" buttons — replace overflow link with `Link to="/qa/submissions"` filtered by franchise
- KPIs reflect only assigned-franchise scope

---

## 2. Submissions Review Workspace (`src/routes/qa.submissions.tsx`)

Replace the current card-list-clutter with a focused two-pane workspace.

**Layout (desktop):**

```text
┌─ Header: title + franchise filter + refresh ───────────────┐
├─ Filter rail (chips): Pending · Revision · Approved · All ─┤
│  Sub-chips: Course practicals / Project submissions        │
├──────────────┬──────────────────────────────────────────────┤
│ Queue list   │  Review pane                                 │
│ (left, 380px)│  ┌─ Member header (avatar, name, franchise)─┐│
│              │  │ Lesson/Project title · submitted date    ││
│ Compact rows:│  ├──────────────────────────────────────────┤│
│ ▸ Member     │  │ File preview (img/pdf/video/download)    ││
│   Lesson     │  │                                          ││
│   franchise  │  ├──────────────────────────────────────────┤│
│   • status   │  │ Grading form: letter, %, feedback, save  ││
│              │  └──────────────────────────────────────────┘│
└──────────────┴──────────────────────────────────────────────┘
```

On mobile the right pane collapses into a full-screen sheet when a row is selected.

**Reuses:**
- Grading logic stays inside `LessonReviewDialog` / `ProjectGradeDialog`. We extract their **inner form bodies** into `LessonReviewPanel` / `ProjectReviewPanel` (the dialog versions become thin wrappers). The new workspace renders the panel inline on the right; mobile still uses the dialog.
- File preview becomes a small `SubmissionFilePreview` component (handles image, pdf iframe, video, generic download link).
- Existing data load (`load()`) is kept; only the rendering changes.

**Wins over current UI:**
- Reviewer never loses queue context when opening a submission
- Status chips replace the double `Tabs` stack (kind + status) for a less cluttered top
- Queue rows are denser (24-28px tall vs full cards), letting many more fit on screen
- Inline review pane = one click less per grading, plus visible file while typing feedback

---

## Out of scope (call out, don't build)

- No DB schema or RLS changes — current QA policies already scope reads/updates correctly.
- No new server functions; everything stays client-side using the existing `supabase` client + RLS.
- No changes to `LessonReviewDialog`/`ProjectGradeDialog` public APIs other than extracting the inner panel for reuse.

---

## Technical notes (for the build step)

- Extract grading form body into `src/components/grading/LessonReviewPanel.tsx` and `ProjectReviewPanel.tsx`. Dialogs render `<Panel ... />` inside `DialogContent`. The workspace renders the same panel directly in the right pane.
- Add `fetchQaPerformance()` in `qa.index.tsx` (or `src/lib/qa-performance.ts` if cleaner) — same shape as `fetchOrgPerformance` minus CEO-only sections. Use a React Query key `["qa", "performance"]`.
- Submissions workspace: keep current `load()` but track `selectedId` + `selectedKind`; pass selected row's data into the inline panel. Use a `useMediaQuery('(min-width: 1024px)')` (via `use-mobile`) to switch between split view and dialog mode on small screens.

