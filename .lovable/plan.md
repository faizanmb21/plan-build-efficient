

Goal: on each member card in the CEO franchise detail view, surface attendance data and link into snapshots; on the member side, add (1) profile avatar upload, and (2) a manual attendance check-in photo upload.

## 1. Attendance metrics on member cards (CEO → Franchises → detail)

In `src/routes/ceo.franchises.$id.tsx`:
- Extend the existing data load to also pull `study_sessions` (last 7 days) and `attendance_snapshots` (today) for the franchise members in one batched query each.
- Aggregate per member: `activeToday`, `activeWeek`, `liveNow` (any session with no `ended_at`), `snapsToday`, `lastSeen`.
- Add these to the `MemberStats` shape and render them on the card:
  - “Today active” / “7-day total” chips next to the existing Started / Done / Active stats.
  - “Live” pill when a session is currently open.
  - “Snapshots today: N” with a “View” button.

## 2. Snapshot viewer dialog (CEO side)

- Reuse the same pattern as `src/routes/incharge.attendance.tsx` `SnapshotDialog`:
  - Open a dialog from the member card showing today’s snapshots (webcam, screen, and the new manual ones).
  - Sign URLs from the `attendance` storage bucket.
- Existing RLS on `attendance_snapshots` already allows CEO to read all → no DB changes needed for this.

## 3. Member-side: profile avatar upload

- Add an avatar upload control on `src/routes/profile.tsx`:
  - Upload to a new public `avatars` storage bucket at path `avatars/{userId}/avatar.jpg` (upsert).
  - Save the public URL into `profiles.avatar_url` (column already exists).
- Show the avatar on:
  - The profile page itself.
  - Each member card in the CEO franchise detail view (small circular image in the card header).
- Migration:
  - Create `avatars` bucket (public).
  - RLS policies on `storage.objects` for the `avatars` bucket: anyone can read, only the authenticated user can upload/update/delete files under their own `{userId}/...` prefix.

## 4. Member-side: manual attendance check-in photo

- Add a “Check-in photo” card on `src/routes/member.focus.tsx`:
  - Single button → opens file picker (or camera capture on mobile via `capture="user"` on the input).
  - Uploads JPEG to existing private `attendance` bucket at `{userId}/manual/{timestamp}.jpg`.
  - Inserts a row into `attendance_snapshots` with a new `kind = "manual"` (the column is plain text, no enum constraint — no migration needed).
  - `session_id` is `NOT NULL` in the table → we’ll relax this with a migration so manual check-ins don’t require an active session, OR alternatively only allow manual check-ins while a session is running.
- Recommended: small migration to make `attendance_snapshots.session_id` nullable so manual check-ins work without a live session. CEO/incharge dialogs already render any kind.

## 5. End-to-end verification

- As CEO: open a franchise detail page → confirm each member card shows today/week active time, live badge if running, snapshot count, and the snapshot dialog opens with images.
- As member:
  - Profile page → upload avatar → reload → see avatar; CEO franchise detail card now shows it.
  - Focus page → upload a manual check-in photo → CEO sees it appear in that member’s snapshots dialog.

## Technical details

Files to update:
- `src/routes/ceo.franchises.$id.tsx` — extend data load, add attendance cells + snapshot dialog + avatar.
- `src/routes/profile.tsx` — avatar upload UI, write to `profiles.avatar_url`.
- `src/routes/member.focus.tsx` — manual check-in photo upload.
- New migration:
  - Create public `avatars` storage bucket.
  - RLS policies on `storage.objects` for `avatars` (public read, owner-only write under `{auth.uid()}/...`).
  - Make `attendance_snapshots.session_id` nullable.

No edge functions or new tables required. Existing RLS already lets CEO read snapshots/sessions and members manage their own.

