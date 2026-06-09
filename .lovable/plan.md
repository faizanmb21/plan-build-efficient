# Work Session Tracking + Auto-Lock + AI EOD Summary

## Audit findings

**Q: Does `study_sessions` already track active time?**
Yes. `study_sessions(user_id, started_at, ended_at, active_seconds, idle_seconds, blur_count, last_heartbeat_at)` already records clock-in/out style data via `useFocusTracker` (`src/hooks/use-focus-tracker.tsx`). It currently **requires screen share + webcam capture** and writes attendance snapshots — heavier than what Feature 1 asks for. There's also `close_stale_sessions()` RPC and incharge/CEO RLS read policies. We will **reuse this table** rather than create a parallel `work_sessions` table; add columns for the AI summary and clock-out reason. (The "Focus session" page on `/member/focus` already exposes start/stop, but it's separate from the member dashboard and gated by screen-share.)

**Q: Existing inactivity detection?**
Yes — `src/hooks/use-inactivity-logout.tsx` watches mousemove/keydown/click/touch/scroll with throttling + a warning toast + signOut. Pattern is directly reusable for Trigger B (global). `useFocusTracker` also tracks `lastActivity` for its 10-min auto-stop. Nothing currently watches per-course-page scroll/click for a 2-min window (Trigger A).

**Q: Cleanest way to call Anthropic?**
This stack = TanStack Start. Use a **`createServerFn` in `src/lib/work-session.functions.ts`** that calls Anthropic server-side. But — **we should use Lovable AI Gateway** (`LOVABLE_API_KEY` already provisioned, no extra secret needed) with an equivalent model rather than adding an `ANTHROPIC_API_KEY`. Recommend `google/gemini-3-flash-preview` (default) or `openai/gpt-5-mini` for the short warm paragraph. If the user insists on `claude-sonnet-4-20250514` specifically, we'd add `ANTHROPIC_API_KEY` as a secret and `fetch` Anthropic from the server fn — **flag for confirmation**.

**Q: `profiles.expected_daily_hours`?**
Not present. Needs to be added.

## Schema changes (one migration)

1. `ALTER TABLE profiles ADD COLUMN expected_daily_hours numeric(4,2) NOT NULL DEFAULT 8;`
2. `ALTER TABLE study_sessions ADD COLUMN ai_summary text, ADD COLUMN end_reason text;`
   - `end_reason ∈ {'manual','auto_idle_global','auto_idle_course','stale','screen_share_ended'}`
3. No new table. No new RLS — existing `study_sessions` and `profiles` policies cover member/incharge/CEO reads.

## What to build

### Feature 1 — Clock in / out (lightweight)
- New hook `useWorkSession` (no screen share, no webcam). Inserts a `study_sessions` row on clock-in, heartbeats every 30s updating `active_seconds` + `last_heartbeat_at`, sets `ended_at` + `end_reason` on stop.
- Member dashboard card on `src/routes/member.index.tsx`: big "Start work" / "Clock out" button + live elapsed timer + today's total.
- Keep existing `/member/focus` (screen-share variant) as-is for now.

### Feature 2 + 5 — Expected daily hours
- Add `expected_daily_hours` input to bulk + single member creation dialogs (`BulkCreateAccountsDialog`, `CreateAccountDialog` in `FranchisesAndInvitesSection`), default 8.
- Add an "Edit member" inline editor on `RosterTable` rows (or on the drill-down) to update it post-creation.
- `member-progress.ts`: include `expected_daily_hours`, compute `target_hours_week = expected * weekdays_so_far`. Show **target vs actual** in `RosterTable` (new column or under "Hours week") and in `MemberDetailView` KPIs.

### Feature 3 — Auto clock-out
- **Trigger B (global, 3 min)**: new `useGlobalInactivityClockOut({ enabled: isClockedIn, idleMs: 180_000 })` modeled on `use-inactivity-logout.tsx` but instead of `signOut`, calls `clockOut('auto_idle_global')` and shows a full-screen overlay. Mounted in member layout (`src/routes/member.tsx`) whenever a session is active.
- **Trigger A (course page, 2 min)**: similar hook scoped inside `src/routes/member.courses.$id.tsx` watching `scroll` + `click` on the course container, idleMs 120_000, reason `auto_idle_course`. Trigger A fires before B by design (shorter window on course pages).
- **Full-screen overlay**: new `<SessionPausedOverlay />` rendered in member layout, shown when `end_reason` starts with `auto_idle_*`. Copy: *"Looks like you stepped away. Please stay focused — your session has been paused. Clock back in when you're ready."* with a "Clock back in" button. Does **not** call `supabase.auth.signOut`.

### Feature 4 — AI EOD summary
- Server fn `generateSessionSummary({ sessionId })` in `src/lib/work-session.functions.ts`:
  1. Load session row (auth-scoped via `requireSupabaseAuth`).
  2. Query `lesson_progress` rows with `completed_at BETWEEN started_at AND ended_at` for the user (join lesson titles).
  3. Query `project_submissions` created in that window.
  4. Query `submissions` + `project_submissions` where `reviewed_at` is in window for grades received.
  5. Call Lovable AI Gateway (`google/gemini-3-flash-preview`) with a tight system prompt ("warm, encouraging, max 4 sentences"). [If user requires Anthropic specifically: switch to `ANTHROPIC_API_KEY` + `https://api.anthropic.com/v1/messages`.]
  6. `UPDATE study_sessions SET ai_summary = …`.
- Triggered automatically at the end of every clock-out path (manual button, Trigger A, Trigger B, screen-share stop, stale-close). Fire-and-forget from client; member dashboard polls/refetches the latest session row to display once available.
- **Display**:
  - Member: card on `member.index.tsx` showing last session's AI summary + stats after clock-out.
  - Incharge/CEO: new "Session history" section in `MemberDetailView.tsx` — list recent `study_sessions` with date, duration, end reason badge, and the AI summary text.

## Build order

1. **Migration** — `expected_daily_hours` on profiles, `ai_summary` + `end_reason` on study_sessions.
2. **Server fn** — `clockIn`, `clockOut(reason)`, `generateSessionSummary` (Lovable AI).
3. **`useWorkSession` hook** + member dashboard clock-in card.
4. **Auto clock-out** — global hook in `member.tsx`, course-scoped hook in `member.courses.$id.tsx`, `SessionPausedOverlay`.
5. **Wire summary generation** into all clock-out paths; member dashboard "Last session" card.
6. **Expected hours** — add field to create dialogs, edit affordance, surface target vs actual in roster + drill-down.
7. **Session history** panel in `MemberDetailView`.

## Open questions before I build

- **Anthropic vs Lovable AI**: OK to use Lovable AI Gateway (no new key, free quota) with `google/gemini-3-flash-preview`? Or hard requirement on `claude-sonnet-4-20250514` (needs `ANTHROPIC_API_KEY` secret)?
- **Existing `/member/focus` page**: keep as a separate "deep focus with screen share" mode, or replace it with the new lightweight clock-in?
- **Live "who's clocked in"**: add a small widget to CEO + Incharge dashboards now, or defer? (Easy — `study_sessions WHERE ended_at IS NULL`.)
- **Trigger A scope**: only on `/member/courses/$id` lesson pages, or also on projects/grades pages?
