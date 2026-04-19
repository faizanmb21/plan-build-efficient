

User wants a "Add from YouTube playlist" option in the lesson creation flow that auto-fetches every video in the playlist and creates one lesson per video — without disturbing the existing single-video URL/upload tabs.

Let me check what already exists for video metadata fetching and the AddLessonDialog structure.

We already have:
- `video-oembed` edge function returning title + duration for a single YouTube/Vimeo URL.
- `parseVideoUrl` in `src/lib/video-embed.ts` for YouTube link parsing.
- `addLesson(sectionId, type, title, content, duration)` already used in `AddLessonDialog`.

YouTube playlist video listing requires the **YouTube Data API v3** (`playlistItems.list`) — oEmbed doesn't list playlist contents. This needs a `YOUTUBE_API_KEY` secret. The free quota (10,000 units/day) easily covers daily playlist imports (1 unit per `playlistItems` page of 50 videos).

## Plan

### Step 1 — New edge function `youtube-playlist`
- Accepts `{ playlistUrl }`, extracts `list=` ID, calls `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=...&key=$YOUTUBE_API_KEY`.
- Paginates through `nextPageToken` until done (handles playlists >50 videos).
- For each item also pulls `videos.list?part=contentDetails` in batches of 50 to get ISO 8601 duration → seconds.
- Returns `{ playlistTitle, items: [{ videoId, title, description, durationSeconds, thumbnailUrl, watchUrl }] }`.
- Skips deleted/private videos gracefully.
- Public CORS, no auth required (it's just public metadata).

### Step 2 — Request `YOUTUBE_API_KEY` secret
Use `add_secret` so the user provides their YouTube Data API v3 key (they generate it in Google Cloud Console — free, takes ~3 min). Wait for the secret before deploying the function.

### Step 3 — Add "Playlist" tab to AddLessonDialog
File: `src/routes/ceo.courses.$id.edit.tsx` (the `AddLessonDialog` component for `video` lessons only).

Current tabs: `Paste link` | `Upload file`. Add a **third tab**: `Playlist`. The existing two tabs stay exactly as they are.

Playlist tab UI:
- Input: paste YouTube playlist URL.
- "Fetch videos" button → calls `youtube-playlist` function → shows checklist of every video found, with title + duration + thumbnail, all checked by default.
- User can uncheck any they don't want, optionally edit titles inline.
- "Add N lessons" button → loops through selected items, calls `addLesson(sectionId, "video", title, { url, source: "link" }, durationSeconds)` for each, in order, one after another. Shows progress ("Adding 3/12…").
- Closes dialog on success with a toast: "Added 12 lessons from playlist".
- All videos go into the **same section** (the section the dialog was opened from).
- The optional assignment toggle is hidden in playlist mode (assignments are per-lesson and would be confusing to apply in bulk).

### Step 4 — Lightweight error handling
- Invalid URL → "That doesn't look like a YouTube playlist link."
- API quota exceeded / private playlist → friendly toast with the upstream message.
- Empty playlist → "No videos found."

### Files touched
- New: `supabase/functions/youtube-playlist/index.ts` — edge function (~80 lines).
- Edited: `src/routes/ceo.courses.$id.edit.tsx` — add `Playlist` tab + bulk-add flow inside `AddLessonDialog` only (LessonEditorDialog stays unchanged — editing is per-lesson).
- New (optional helper): `src/lib/youtube-playlist.ts` — client wrapper around the edge function + ISO 8601 duration parser if needed (most parsing happens server-side).

### Verification
- Open a course → Add lesson → Video → Playlist tab → paste any public YouTube playlist URL → fetch → see list of videos → click "Add 12 lessons" → all 12 appear in the section in correct order with titles + durations.
- Existing "Paste link" and "Upload file" flows are untouched.

