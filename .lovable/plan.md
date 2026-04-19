
The user wants me to clean up the **course edit page** (`src/routes/ceo.courses.$id.edit.tsx`) UI to feel like Udemy's course editor. They specifically called out:

1. Status is duplicated — there's a "published" badge, a "Draft / Published" toggle, AND a "Published" select dropdown. Three controls for one piece of state.
2. No clear "Save" affordance for the curriculum/lesson changes (only "Save details" exists for course details).
3. Wants improvements scoped to the **header + course details + curriculum** area only — not changing the lesson dialogs.

Let me check the file structure to plan precisely.

Looking at the screenshot: header has "All courses" + "published" pill + "Draft/Published" toggle. Below, "Course details" card has its own Status dropdown. That's 3 status controls.

For curriculum: sections/lessons currently auto-save on every action (rename, drag, add). That's actually fine — the issue is users *don't know* it auto-saves. Udemy shows subtle "Saved" indicators.

## Plan

### 1. Consolidate status into ONE control (header)
- Remove the "published" badge pill in the header.
- Remove the "Status" dropdown from the Course details card.
- Keep ONE control in the header: a clean Draft ↔ Published segmented toggle with a small "Saved" indicator next to it that flashes when status changes.
- Status changes save instantly (already do) — show toast + inline checkmark.

### 2. Course details card — clearer save state
- Remove Status field from the grid; let Title take full width (cleaner, like Udemy).
- Track a `dirty` flag: enable "Save details" only when Title or Description changed.
- After save, button becomes "Saved ✓" for 2s, then disabled until next edit.
- If user navigates away with unsaved changes, show a confirm prompt (`beforeunload`).

### 3. Curriculum — Udemy-style polish
- Add a subtle header next to "Curriculum": auto-save indicator ("All changes saved" with a check, or "Saving…" while a mutation is in flight) — driven by a small mutation counter.
- Section header improvements:
  - Click anywhere on the section row (not just the chevron) to expand/collapse.
  - Lesson count badge stays.
  - Three-dot menu replacing the standalone trash icon: Rename / Delete (matches Udemy's overflow pattern).
- Lesson row improvements:
  - Show duration on the right (e.g. `8:42`) for video lessons — we already store `duration_seconds`.
  - Three-dot menu: Edit / Delete (replaces inline trash).
  - Smaller, lighter type icon chip ("Video" / "Quiz" / "Practical") with color coding.
- Empty section state: "No lessons yet — add your first lesson" with a centered button instead of a bare "Add lesson" button.
- Sticky "Add section" button at the bottom of the curriculum card so it's always reachable in long courses.

### 4. Visual polish
- Tighten card padding, use consistent 1rem gaps.
- Drag handles fade in only on row hover (less noisy at rest).
- Section headers get a subtle background tint when expanded so the boundary is clearer.

### Files touched
- `src/routes/ceo.courses.$id.edit.tsx` — header restructure, remove Status dropdown, dirty-state tracking, save-state indicator, section/lesson row redesign with overflow menus, sticky add-section button.

### Out of scope (user said "only the curriculum section" + the header issues they pointed at)
- AddLessonDialog, LessonEditorDialog, drag-and-drop logic, playlist import flow — all unchanged.
- Member-side course player — unchanged.

### Verification
- Open any course → header shows ONE status toggle, no duplicate badges/dropdowns.
- Edit title → "Save details" lights up; click → shows "Saved ✓".
- Add/rename/delete a lesson → "All changes saved" indicator confirms it without a manual save button.
- Each lesson row shows its duration and an overflow menu with Edit/Delete.
