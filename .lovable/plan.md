
The user wants to redesign the member dashboard (`/member` index). Two concerns:
1. Skill flower takes too much vertical space, pushes courses below the fold
2. No "completed" state, no "next steps", no "continue learning" focus — feels incomplete vs. Thinkific/Udemy

Let me look at what good LMS dashboards do (Thinkific, Udemy, Coursera, Teachable):
- **Hero "Continue learning"** card at the top — the one in-progress course, big CTA
- **Stats strip** — courses enrolled, completed, hours learned, current streak
- **In progress** section (cards with progress bars)
- **Not started / Up next** section
- **Completed** section (collapsed/secondary, with certificate or "Review" CTA)
- **Skill mastery** moved to a sidebar OR a smaller compact widget OR a separate "My Progress" tab
- **Deadlines / overdue** alert banner if anything is due

For the completed-course experience:
- Confetti/celebration on the course page when last lesson done
- "Course complete" badge + score
- "What's next" — recommended next course or next assigned course
- "Review" CTA stays available

## Plan: Redesign the Member dashboard (Thinkific/Udemy style)

### Layout (top → bottom)

```text
┌────────────────────────────────────────────────────────────┐
│ Hi Maaz 👋  — "You're on a 3-day streak"                  │
│ [Stats: 5 enrolled · 2 done · 12.4 hrs · 1 due soon]      │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│ CONTINUE LEARNING                                          │
│ ┌────────┐  Course title · Section / Lesson title         │
│ │ thumb  │  ▓▓▓▓▓░░░░░ 47%                                │
│ └────────┘  [▶ Resume lesson]                             │
└────────────────────────────────────────────────────────────┘

┌─ Overdue / Due soon banner (only if any) ─────────────────┐

In progress (3)               [grid of cards w/ progress]
Not started (2)               [grid of cards, "Start"]
Completed (2)                 [collapsed, "Review" / cert]

[Skill flower — collapsible, smaller (240px), under courses]
or moved to /member/grades page as "Mastery"
```

### Concrete changes

**1. `src/routes/member.index.tsx` — full rewrite of the layout**
- Add a **welcome header** with first name + 4 stat tiles (enrolled / completed / hours studied from `study_sessions.active_seconds` / due-soon count).
- Add **"Continue learning" hero**: pick the most-recently-touched in-progress course (max `lesson_progress.updated_at`), show big card with thumbnail, current section/lesson title, progress bar, big "Resume" button linking to `/member/courses/$id`.
- Bucket the assignments into three sections:
  - **In progress** (0 < pct < 100)
  - **Not started** (pct === 0) — show "Start course" CTA
  - **Completed** (pct === 100) — collapsed by default via a `<details>` or accordion, "Review" button
- **Overdue banner** at top in destructive variant if any assignment past deadline and not 100%.
- Move the **skill flower** to the bottom in a smaller (260px) collapsible card, OR mirror it on the Grades page only. Pick: keep it on the dashboard but make it collapsible and 260px so it doesn't dominate.

**2. `src/routes/member.courses.$id.tsx` — completion celebration**
- When `pct === 100`, show a **"🎉 Course complete!"** banner above the lesson list with:
  - Letter-grade summary if any submissions exist
  - "Review lessons" stays available
  - "What's next" button → links to next assigned in-progress / not-started course (or back to `/member` if none)

**3. Optional polish**
- Add a tiny **streak calculator** in the header: count distinct days in last 14 with `study_sessions.started_at`.
- Empty states for each bucket so the page never looks blank.

### Files touched
- `src/routes/member.index.tsx` — major rewrite (keep data fetching, restructure UI)
- `src/routes/member.courses.$id.tsx` — add completion banner + "what's next" logic

### Verification
Log in as `newtest@irmacademy.test` / `Academy@123`:
1. Dashboard shows welcome + 4 stats + "Continue learning" hero (or "Start your first course" empty state if none assigned)
2. Assigned courses are bucketed: In progress / Not started / Completed
3. Skill flower is compact and collapsible at the bottom
4. Open a course, finish all lessons → see "Course complete" banner with "What's next" link

