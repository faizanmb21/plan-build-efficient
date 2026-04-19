

User wants 3 fixes to the AddLessonDialog (and LessonEditorDialog):
1. Restore "upload file" option alongside the URL field (was removed in unified dialog)
2. Wire up the "Auto-fill" button to actually fetch title/description from video URL
3. Add a file attachment to the optional assignment brief (any file type)

Let me check the current state of the editor and the existing oembed function.

There's already a `video-oembed` edge function returning `{title, durationSeconds, provider}`. I'll use that for auto-fill (title + duration). Description isn't returned by oEmbed for YouTube — I'll fall back to title-only and note it.

Storage buckets: `course-content` (for video/PDF uploads, already used) and we'll reuse it for assignment attachments too (or use a new path prefix).

## Plan

### 1. Restore upload-or-link in `AddLessonDialog` (and keep in `LessonEditorDialog`)
File: `src/routes/ceo.courses.$id.edit.tsx`
- For `video` and `pdf` lesson types, show BOTH:
  - URL input (paste link) — already there
  - File upload button — re-add (uploads to `course-content` bucket, stores path in `content.path`)
- The lesson stores whichever was provided; player already prefers `url` over `path`.
- Show a subtle "or" divider between them.

### 2. Wire up "Auto-fill" button
File: `src/routes/ceo.courses.$id.edit.tsx`
- The button exists but does nothing. Hook it to call the existing `video-oembed` edge function with the pasted URL.
- On success: populate `title` (if empty) and `duration_seconds` (if empty). Toast success.
- On failure: toast a friendly "Couldn't auto-fill — paste manually" message.
- Disable the button when URL field is empty; show a small spinner while fetching.

### 3. Add file attachment to assignment brief
File: `src/routes/ceo.courses.$id.edit.tsx` (both AddLessonDialog and LessonEditorDialog)
- Inside the "Attach a tech-test / project" section (when toggle is ON), add an **optional file attachment** alongside the brief textarea — accepts any file type (PDF, audio, video, doc, etc.).
- Stored under `content.assignment.attachment_path` in `course-content` bucket (path: `assignments/{courseId}/{uuid}.{ext}`).
- Show filename + remove button after upload.

Member side — `src/routes/member.courses.$id.tsx`:
- In the `PracticalSubmit` brief block, if `assignment.attachment_path` exists, fetch a signed URL and render a "Download brief attachment" button under the brief text.

### Files touched
- `src/routes/ceo.courses.$id.edit.tsx` — restore file upload field, wire Auto-fill, add assignment attachment uploader (in both Add + Edit dialogs).
- `src/routes/member.courses.$id.tsx` — render assignment attachment download link in `PracticalSubmit`.

No DB migration needed — everything stored in the existing `lessons.content` JSONB and the `course-content` storage bucket.

### Verification
- Add a video lesson by URL → Auto-fill populates title and duration.
- Add a video lesson by upload → file uploads, lesson plays it.
- Add an assignment with a PDF brief attachment → member sees the brief text + download button.

