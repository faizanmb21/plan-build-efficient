

## Plan: Replace browser dialogs with in-app UI everywhere + add playlist-first course creation

Two things in one pass:

### Part 1 — Replace native browser popups with in-app dialogs

Native `confirm()`, `alert()`, and `prompt()` calls show ugly browser-chrome modals that don't match the dark glass theme. Swap every one for a themed shadcn `AlertDialog` (for confirm/alert) or `Dialog` with an `Input` (for prompt).

**Confirmed usages to replace** (found via search across all dashboards):

CEO routes:
- `ceo.courses.index.tsx` — `confirm("Delete this course and all its content?")`
- `ceo.courses.$id.edit.tsx` — multiple `confirm(...)` for delete section, delete lesson, delete quiz question, etc.
- `ceo.franchises.$id.tsx` — `confirm("Remove this member from franchise?")`
- `ceo.franchises.index.tsx` — `confirm("Delete franchise?")`
- `ceo.projects.tsx` — `confirm("Delete project?")` and any `prompt(...)`
- `ceo.assign.tsx`, `ceo.seed.tsx` — any remaining confirms

Incharge routes:
- `incharge.projects.tsx` — delete project confirm
- `incharge.assign.tsx`, `incharge.members.tsx` — remove/unassign confirms

Member routes:
- `member.projects.tsx` — resubmit / withdraw confirms (if any)

**Approach** — build one tiny shared helper to keep edits small:

New file `src/components/ui/confirm-dialog.tsx` exporting:
- `<ConfirmDialog open onOpenChange title description confirmLabel variant onConfirm />` — themed AlertDialog wrapper with destructive/default variants
- `useConfirm()` hook returning `confirm({ title, description, confirmLabel, variant })` that returns a Promise<boolean> — lets us replace `if (!confirm("..."))` with `if (!(await confirm({...})))` in one line, no JSX restructure per call site

Mount a single `<ConfirmDialogHost />` once inside `AppShell` so the hook works from any route without per-page wiring.

For the rare `prompt()` cases, add a sibling `usePrompt()` hook that opens a `Dialog` with an `Input` and returns `Promise<string | null>`.

### Part 2 — Playlist-first "New course" dialog (from previous plan, slightly refined)

Same as the previously-discussed plan, refined to use the new in-app confirm helper for any error states:

Replace the current `<form>` inside the New Course dialog in `src/routes/ceo.courses.index.tsx` with shadcn `<Tabs>`:

**Tab 1 — From YouTube playlist** (default)
- Paste playlist URL → **Fetch** button calls existing `fetchYoutubePlaylist()` from `src/lib/youtube-playlist.ts`
- Pre-fills: course title (from playlist title, editable), thumbnail (first video's `thumbnailUrl`), description (optional)
- Preview list: "Found N videos · total Xh Ym" with per-video checkboxes (all on by default)
- Section strategy radio:
  - Single section "All lessons" (default)
  - Auto-chapter every N videos (number input)
- **Create course** → atomic insert chain: course → section(s) → lessons (preserving playlist order, `type: "video"`, `content: { video_url }`, `duration_seconds`) → cleanup-on-failure deletes the half-built course
- Toast and redirect to `/ceo/courses/$id/edit`

**Tab 2 — Custom (build manually)**
- Today's exact form: Title + Description → empty editor (unchanged)

Keep the existing in-editor playlist importer in `AddLessonDialog` untouched (still useful for adding a second playlist later).

### Files

New:
- `src/components/ui/confirm-dialog.tsx` — `ConfirmDialog`, `useConfirm`, `usePrompt`, `ConfirmDialogHost`

Edited:
- `src/components/AppShell.tsx` — mount `<ConfirmDialogHost />` once
- `src/routes/ceo.courses.index.tsx` — playlist-first tabs in New Course dialog + replace `confirm()` with `useConfirm()`
- `src/routes/ceo.courses.$id.edit.tsx` — replace all `confirm()` calls
- `src/routes/ceo.franchises.$id.tsx`, `ceo.franchises.index.tsx`, `ceo.projects.tsx`, `ceo.assign.tsx`, `ceo.seed.tsx` — same swap
- `src/routes/incharge.projects.tsx`, `incharge.assign.tsx`, `incharge.members.tsx` — same swap
- `src/routes/member.projects.tsx` — same swap if any confirms exist

No DB changes. No new dependencies.

### Verification

1. CEO → /ceo/courses → New course → "From YouTube playlist" tab default → paste a playlist link → Fetch → see title/thumbnail prefilled + checklist of videos → Create → lands in editor with sections + lessons populated, thumbnail set.
2. CEO → /ceo/courses → click delete on any course → themed dark dialog appears (not a native browser popup) with Cancel + destructive Delete buttons.
3. CEO → /ceo/courses/{id}/edit → delete a lesson, delete a section, delete a quiz question → all show themed dialogs.
4. CEO → /ceo/franchises → delete franchise / remove member → themed dialogs.
5. Incharge → /incharge/projects → delete a project → themed dialog.
6. Switch to "Custom" tab in New Course → Title + Description only → behaves exactly like today.
7. Cancel on any themed dialog → no action taken; Confirm → action runs and toast appears.

