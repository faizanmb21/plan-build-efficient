

## Plan: Polish the New Course dialog + add "Preview as member" for CEO

Three small fixes in two files:

### 1. Fix overlapping title and duration in the playlist video list
In `src/routes/ceo.courses.index.tsx`, the video rows in the playlist preview can collide because the long title sits in the same row as the duration with only `truncate` (single-line). When the title wraps to a second line behind the scrollbar it visually crashes into the duration column.

Fix the row layout (`<label>` inside the playlist preview list):
- Switch from single-line `truncate` to a 2-line clamp (`line-clamp-2`) so long titles wrap cleanly.
- Make the duration a fixed-width, non-shrinking column (`shrink-0 w-14 text-right`) and align it to the top of the row (`items-start`) so it never collides with wrapped title text.
- Add `pr-2` to the list container so text doesn't sit under the scrollbar.

Also tighten the header row above the list — give "X of Y selected" and "Total …" each their own column so they can't overlap on narrow widths.

### 2. Capitalize the status badge ("Published" / "Draft")
On the course card in `src/routes/ceo.courses.index.tsx`, the badge currently renders the raw enum value (`published` / `draft`). Render it title-cased:
```tsx
{c.status.charAt(0).toUpperCase() + c.status.slice(1)}
```

### 3. "Preview as member" button on each course card (CEO only)
Members already have a working course player at `/member/courses/$id` (see `src/routes/member.courses.$id.tsx`). The CEO can navigate there directly — RLS lets the CEO read any course. So we just add an action button to the CEO course card that opens that route in a new tab so the CEO's own work session in the dashboard isn't disrupted.

In the course card action row in `src/routes/ceo.courses.index.tsx`:
- Replace the current 2-button row (Edit + Delete trash) with a 3-button row:
  - **Preview** (eye icon, ghost variant) → `<a href="/member/courses/{id}" target="_blank" rel="noopener noreferrer">` so the CEO sees the exact member experience (sections, lessons, video player, quizzes, practical submit UI) in a fresh tab.
  - **Edit** (pencil, outline, flex-1) — unchanged.
  - **Delete** (trash, ghost icon) — unchanged.
- Add `Eye` to the existing `lucide-react` import.

No backend or RLS work needed — CEO already has read access to courses, sections, lessons, and lesson_progress; the member route will simply render whatever the CEO clicks. (Submitting a practical or marking progress as the CEO would write a row tied to the CEO's user_id, which is harmless and only visible to them.)

### Files

Edited:
- `src/routes/ceo.courses.index.tsx` — three changes above (row layout fix, capitalized badge, Preview button + Eye import).

No new files. No DB or route changes.

### Verification

1. CEO → /ceo/courses → New course → Fetch a long-titled playlist → titles now wrap to 2 lines and durations stay right-aligned in their own column with no overlap.
2. CEO → /ceo/courses → existing course card shows badge **"Published"** (capital P) instead of "published".
3. CEO → /ceo/courses → click new **Preview** button on a card → opens `/member/courses/{id}` in a new tab, showing the full member-side player exactly as a member sees it.
4. Edit and Delete buttons still work as before.

