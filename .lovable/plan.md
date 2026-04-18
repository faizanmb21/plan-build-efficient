
## IRM Academy — Lean MVP Plan

### What we're building (v1)
A private, invite-only LMS with 3 roles. The full blueprint is huge (40+ routes, 25 tables, 7 phases). To keep credits low, v1 covers **only the core learning loop**:

> **Invite → Login → CEO builds course → Assigns to franchise/member → Member learns → Submits practical → Incharge grades → Member sees grade.**

Everything else (badges, streaks, leaderboards, certificates, dashboards-with-charts, announcements, discussions, audit log, dark mode, PWA, email, WhatsApp, learning paths, prerequisites) is **deferred** to later small builds.

### Backend (Lovable Cloud — built-in, no setup needed)
- **9 tables only** (vs 25 in blueprint):
  `profiles`, `user_roles`, `franchises`, `invites`, `courses`, `sections`, `lessons`, `lesson_progress`, `submissions`, plus `quizzes`/`quiz_questions`/`quiz_attempts` merged into the lessons flow.
- Roles stored in a separate `user_roles` table with `app_role` enum (`ceo`, `incharge`, `member`) and a `has_role()` security-definer function — required for safe RLS.
- RLS on every table: CEO sees all, Incharge sees their `franchise_id`, Member sees their own rows.
- Storage buckets: `course-content` (private — videos/PDFs), `thumbnails` (public), `submissions` (private). Signed URLs for private content.
- One `seedFirstCEO` server function so you can bootstrap the first admin.

### Routes (~16 total, vs 40 in blueprint)
**Public:** `/login`, `/invite/$token`, `/reset-password`
**CEO:** `/ceo` (simple stats), `/ceo/franchises`, `/ceo/courses`, `/ceo/courses/$id/edit` (course builder), `/ceo/assign`, `/ceo/submissions`
**Incharge:** `/incharge` (team list + pending reviews), `/incharge/reviews/$id` (grading)
**Member:** `/member` (my courses), `/member/course/$id` (course player), `/member/grades`
**Shared:** `/profile`

Each role lands on its own dashboard via role-based redirect after login.

### Course builder (Udemy-style, but minimal)
One page with sections → lessons. Lesson types supported in v1:
1. **Video** — upload to storage, native HTML5 player, mark complete at 90% watched
2. **PDF** — embedded viewer, complete at 80% scroll
3. **Quiz** — MCQ + True/False + Short Answer, auto-graded, configurable passing score & attempts
4. **Practical** — brief + file upload, manually graded by Incharge

Drag-and-drop reordering for sections/lessons. No "slides" or "mixed" types — slides = PDF, mixed achieved by adding two lessons.

### Course player (one shared component for Member + Incharge preview)
- Left sidebar: collapsible section/lesson tree with status icons
- Main area: switches based on lesson type
- Auto-resume from last position
- Prev/Next navigation
- Completion screen at end (no certificate yet — just a "Course complete" view)

### Assignment engine
CEO picks course → target (single member, whole franchise, or all) → priority (mandatory/recommended) → optional deadline. Assignment fans out into per-user rows that drive each member's "My Courses" page.

### Grading flow
Incharge `/incharge/reviews` shows pending submissions oldest-first. Click → split view: brief + member's file + grade input + feedback → Approve or Request Revision. Member sees status update on `/member/grades`.

### Design
- Tailwind + shadcn/ui (already installed)
- Colors from blueprint: primary `#1B2A4A`, accent `#3B82F6`, success/warning/danger as specified
- Inter font (Google Fonts)
- Mobile-responsive, sidebar collapses to drawer

### Explicitly deferred (do NOT build now — saves the most credits)
- ❌ Email (Resend) and WhatsApp (WATI) — needs paid API keys + lots of glue code
- ❌ Badges, streaks, leaderboard, gamification edge functions
- ❌ PDF certificates + QR verification
- ❌ Dashboards with charts (Recharts) — replaced with simple stats cards in v1
- ❌ Discussions per lesson
- ❌ Announcements
- ❌ Learning paths + prerequisites
- ❌ Audit log
- ❌ Dark mode + PWA
- ❌ Anti-skip video, Video.js (use native `<video>` instead)
- ❌ CSV/PDF report export

Each of these can be added later as a small focused request when the core platform is proven.

### Build order (in this single implementation pass)
1. DB schema + RLS + roles
2. Auth: login, invite acceptance, role-based redirect, protected route layouts
3. Franchise + invite management (CEO)
4. Course builder (CEO) + storage uploads
5. Assignment flow (CEO)
6. Course player + progress tracking (Member)
7. Practical submission (Member) + grading queue (Incharge)
8. Grades view + simple stats cards on each role's home

### What you need to provide
Just approve. No API keys needed for v1. After approval I'll switch to build mode and ship this in one go. You'll bootstrap the first CEO account from the seeded server function, then invite everyone else from inside the app.
