## Audit — what already exists

Most of this feature is already built. Concrete findings:

**Schema (already in place)**
- `profiles.expected_daily_hours numeric(4,2) NOT NULL DEFAULT 8` ✓
- `study_sessions` columns: `id, user_id, course_id, lesson_id, started_at, ended_at, active_seconds, idle_seconds, blur_count, last_heartbeat_at, client_info, ai_summary, end_reason` ✓
- RLS: member owns rows, incharge reads franchise rows, CEO reads all ✓

**Code (already in place)**
- `src/hooks/use-work-session.tsx` — `WorkSessionProvider` with clock in/out, 30s heartbeat, **global 3-min idle auto-clock-out**, **course-page 2-min idle hook** (`useCourseInactivityClockOut`), resumes open session on mount.
- `src/lib/work-session.functions.ts` — `clockIn` / `clockOut` / `heartbeatSession` server fns. `clockOut` already generates the AI summary (lessons completed + project submissions + graded submissions in session window) via **Lovable AI Gateway** (`google/gemini-3-flash-preview`) and writes `ai_summary` + `end_reason`.
- `src/components/work/WorkSessionCard.tsx` on member dashboard — Start/Stop + live timer.
- `src/components/work/SessionPausedOverlay.tsx` — shown after auto-clock-out.
- Course route already calls `useCourseInactivityClockOut()`.
- `ai_reviews` table is unrelated (per-submission grading). Session AI lives directly on `study_sessions.ai_summary` — correct pattern, no change.

## Gaps vs your spec

1. **No Pause / Resume state.** Currently binary (clocked in or out). Pause UI, paused-time accounting, and "ignore idle while paused" don't exist.
2. **No "Are you still there?" warning modal.** Today inactivity clocks out immediately; you want a polite modal with a grace window where activity cancels the clock-out.
3. **AI provider mismatch.** Implementation uses Lovable AI Gateway (Gemini). Spec says Claude.
4. **"Today's session report" persistence on dashboard.** Last summary is shown transiently after clock-out but not as a stable dashboard card the member can revisit.
5. **Session-history list with summaries in Incharge/CEO member drill-down** — not wired.

## Build plan

### 1. Migration — add pause state
- `study_sessions.paused_seconds int NOT NULL DEFAULT 0`
- `study_sessions.paused_at timestamptz NULL` (set when currently paused, null otherwise)
- `study_sessions.status text NOT NULL DEFAULT 'active'` — values `active | paused | completed`
- Backfill existing open rows to `status='active'`.

### 2. Server functions (`src/lib/work-session.functions.ts`)
- Add `pauseSession({ sessionId, deltaActiveSec })` — flush pending active seconds, set `status='paused'`, `paused_at=now()`.
- Add `resumeSession({ sessionId })` — compute `now() - paused_at`, add to `paused_seconds`, set `status='active'`, `paused_at=null`.
- `heartbeatSession` ignores `deltaActiveSec` when row is paused (defensive).
- `clockOut` finalizes any in-flight pause into `paused_seconds` before writing summary.
- AI summary prompt: include pause duration explicitly ("worked X hours active, paused Y minutes").

### 3. AI provider swap → Claude
- Add `ANTHROPIC_API_KEY` secret (will prompt user).
- Replace gateway call with Anthropic Messages API (`claude-sonnet-4-20250514`) inside `clockOut`.
- Keep the same input data (lessons, projects, grades, time window).

### 4. `useWorkSession` hook updates
- New state: `isPaused: boolean`, exposed actions `pause()` / `resume()`.
- While `isPaused`: stop incrementing `activeSeconds`, skip heartbeat active deltas, **disable global idle detector and course idle detector**.
- New warning flow: at idle threshold − 30s (global at 2:30, course at 1:30), set `idleWarning: 'global' | 'course'`. Any activity clears it. If timer reaches threshold, call `stop(reason)`.

### 5. UI
- `WorkSessionCard`: add Pause/Resume button alongside Stop; show "Paused" badge + frozen timer; disable Pause when not clocked in.
- New `IdleWarningModal` (uses `AlertDialog`): copy "Please stay focused and come back when you're ready", auto-dismisses on activity, "I'm here" button to dismiss manually, countdown to auto-clock-out.
- New `TodaysSessionReport` card on member dashboard (`member.index.tsx`): reads latest `study_sessions` row for today with `ai_summary` and renders it persistently.
- `MemberDetailView` (Incharge/CEO drill-down): add "Recent sessions" list — date, active hours, paused minutes, end reason badge, AI summary expandable.

### 6. Expected daily hours editing
- Already stored. Confirm it's editable in member edit dialog (likely already wired from earlier work — verify and add field to bulk/single create dialogs if missing).

## Build order

1. Migration (pause columns).
2. Server fns: `pauseSession`, `resumeSession`, update `heartbeatSession` + `clockOut`.
3. Swap AI provider to Claude (after `ANTHROPIC_API_KEY` is added).
4. `useWorkSession` — pause/resume + warning state.
5. `WorkSessionCard` Pause button + `IdleWarningModal`.
6. `TodaysSessionReport` dashboard card.
7. Session-history list in `MemberDetailView`.

## Assumptions (call out anything wrong before I build)

- **Warning grace period: 30s** before auto-clock-out. Activity dismisses, "I'm here" button dismisses manually.
- **No pause time cap** — members can stay paused indefinitely; pause does not auto-end.
- **Single pause counter** — accumulate total `paused_seconds`, not per-event history.
- **Claude model**: `claude-sonnet-4-20250514`. Requires adding `ANTHROPIC_API_KEY` runtime secret — I will prompt for it as the first build step. If you'd rather keep the existing Lovable AI Gateway (Gemini, no key needed), say so and I'll skip step 3.
