## What's happening today

I checked the database and confirmed the tech-test you attached to "Graphic Design Basics | FREE COURSE" IS saved correctly (`content.assignment.brief = "SUbmit"` plus the WhatsApp image attachment).

The member course player (`src/routes/member.courses.$id.tsx`) already has code to render the submission panel for any video/PDF/quiz lesson that has an attached assignment. The reason you didn't see it is layout-related, not data-related:

1. The submission panel is rendered **below the YouTube embed**. On the lesson you screenshotted, the video iframe is ~500px tall, and your viewport is 732px, so the "Upload submission" panel is below the fold — you have to scroll past the video.
2. The lesson is already marked "Completed" from before the tech-test was attached. So even though the panel renders, there is currently no visual cue at the top of the page that something is required, and nothing stops the member from clicking the next lesson in the sidebar.
3. There is no enforcement anywhere: members can click any lesson in the sidebar at will, and the "Completed" badge on a lesson is set the moment a submission is **approved by the incharge** — not when the member uploads. So even a perfectly-flowing member could jump ahead.

## What I'll change

### 1. Make the tech-test panel impossible to miss

In the lesson view:
- Move the "Assignment required to complete this lesson" panel **above** the video/PDF, with a clear header ("📋 Tech-test required to unlock the next lesson") and a status pill (Not submitted / Pending review / Approved / Redo required).
- Auto-scroll to it when a lesson with an unmet assignment is opened.
- Show a yellow banner at the top of the lesson card if the assignment isn't approved yet, listing what's blocking progress.

### 2. Enforce sequential lesson unlocking

A lesson is **locked** until the previous lesson in course order (across sections) is `lesson_progress.completed = true`. A lesson is "complete" when:
- For plain video/PDF: member clicks "Mark as completed".
- For quiz: member passes the quiz.
- For practical, OR any lesson with an attached tech-test/assignment: the latest submission for that lesson has `status = 'approved'` (graded A+/A/B by the incharge).

Implementation:
- In the sidebar, lessons after the first incomplete one render with a lock icon and are non-clickable, with a tooltip "Finish the previous lesson first".
- The "Mark as completed" button is hidden whenever `hasAssignment` is true (already true today) — completion is driven solely by submission approval.
- The auto-advance after `markCompleted` only fires if the next lesson is unlocked (it will be, because the just-completed lesson is now done).
- When a member opens a locked lesson via direct URL, show a friendly "🔒 Locked — finish lesson X first" card instead of the player.

### 3. Small fixes uncovered while reading the file

- The submission record for a video lesson with an attached test currently writes its grade to `lesson_progress` only on the incharge's "Save review" — which already exists in `LessonReviewDialog`. I'll double-check the upsert uses the right `lesson_id` (it does today; no change needed, just verifying).
- Add a "Tech-test status" column to the member dashboard list of in-progress lessons so it's obvious where they're stuck.

## Files to edit

```text
src/routes/member.courses.$id.tsx   - reorder LessonView, add lock logic in sidebar, locked-lesson card
src/routes/member.index.tsx         - small status indicator (optional, low risk)
```

No database changes, no RLS changes, no new tables. Approval flow on the incharge side is unchanged.

## What this does NOT change

- The CEO/Incharge editor for attaching tech-tests already works (your data proves it).
- The incharge review flow in `incharge.reviews.tsx` and `LessonReviewDialog.tsx` is unchanged.
- Tab-isolated CEO/Incharge sessions stay as they are.
