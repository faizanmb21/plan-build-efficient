## Scope

Build a comprehensive Member Progress Tracking system across CEO, Incharge, and Member roles. All data fits the existing schema — **no migrations required**.

## Rules (confirmed)

- **Off days**: Sat + Sun (gray cells in 14-day strip)
- **Late**: first `study_sessions.started_at` that day > 10:00 AM Asia/Karachi → amber
- **Pending QA**: count from both `submissions` and `project_submissions` where `status = 'pending'`
- **Status flag thresholds**:
  - At risk = attendance <70% OR progress >40pp behind expected pace OR pending QA ≥4
  - Slipping = any one signal amber (attendance 70–84% / progress 20–40pp behind / pending QA 2–3)
  - On track = all green
- **Expected pace**: linear from `assignment.created_at` → `assignment.deadline`. Skip the pace signal when no deadline exists.
- **Color bands** for completion %: green ≥70, amber 45–69, red <45

## New shared library

`src/lib/member-progress.functions.ts` — server functions (use `requireSupabaseAuth`):

1. `getRosterForScope({ scope })` — `scope: "ceo" | "incharge"`. Returns one row per visible member:
   ```ts
   { userId, fullName, franchiseId, franchiseName, completionPct, hoursThisWeek, attendancePct14d, avgGrade, pendingQa, status: "on_track"|"slipping"|"at_risk" }
   ```
   Queries: `profiles` + `user_roles` (filter `role='member'`) → batch `lesson_progress`/`assignments`/`sections`/`lessons` (reuse `completion-summary.ts`) → `study_sessions` last 7d sum → distinct working days with sessions in last 14d → `submissions` avg grade → `submissions`+`project_submissions` pending count.

2. `getMemberDetail({ userId })` — RLS-checked. Returns:
   ```ts
   { profile, kpis, hoursByCourse: [{courseId,title,seconds}],
     courses: [{courseId,title,completionPct,qaStatus,grade}],
     attendance14d: [{date,state:"present"|"late"|"absent"|"off"}] }
   ```

3. `getMyMemberDetail()` — convenience wrapper that calls `getMemberDetail` with `context.userId`.

4. `exportRosterXlsx({ scope })` — returns base64-encoded xlsx buffer. Two sheets:
   - **Summary**: name, franchise, completion%, total hours (week), attendance%, avg grade, pending QA, status
   - **Hours by Course**: rows = members, columns = courses, cells = hours this week

## New shared utility

`src/lib/attendance-utils.ts` — pure functions:
- `buildAttendanceStrip(sessions, today)` → 14-day array with PKT day bucketing, Sat/Sun = off
- `classifyDay(sessionsForDay)` → "absent" | "late" | "present" (late if earliest > 10:00 PKT)

## New components

- `src/components/progress/RosterTable.tsx` — sortable table (name, franchise [CEO only], completion bar, hours/wk, attendance%, avg grade, pending QA, status badge, drill-down link). "Export report" button calls `exportRosterXlsx`.
- `src/components/progress/MemberDetailView.tsx` — reusable detail view rendering KPI cards, horizontal bar chart (recharts, already in deps), per-course breakdown, 14-day attendance strip. Used by all three drill-down routes.
- `src/components/progress/AttendanceStrip.tsx` — 14 colored cells with date tooltips.
- `src/components/progress/CompletionBar.tsx` — progress bar with color band.
- `src/components/progress/StatusBadge.tsx` — on track / slipping / at risk pill.

## New routes

- `src/routes/ceo.members.tsx` — roster (all franchises, with franchise column + filter)
- `src/routes/ceo.members.$userId.tsx` — drill-down (CEO view)
- `src/routes/incharge.members.$userId.tsx` — drill-down (Incharge view)
- `src/routes/member.progress.tsx` — self-view using `getMyMemberDetail`

## Modified routes

- `src/routes/incharge.members.tsx` — replace current implementation with new `RosterTable` (scope=incharge). Rows link to `/incharge/members/$userId`.
- `src/routes/ceo.tsx` & `src/routes/incharge.tsx` — add "Members" nav link.
- `src/routes/member.tsx` — add "My Progress" nav link.

## Excel export (server-side)

Use `xlsx` package inside `exportRosterXlsx` server fn:
```ts
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(hoursPivot), "Hours by Course");
const buf = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
return { filename: `member-progress-${date}.xlsx`, base64: buf };
```
Client converts base64 → Blob → download (pattern already in `grade-export.ts`).

## Data dependencies (verified, all exist)

| Need | Source |
|---|---|
| Completion % | `lesson_progress` + `lessons` + `sections` + `assignments` |
| Hours / hours-by-course | `study_sessions.active_seconds`, `course_id` |
| Attendance | `study_sessions.started_at` bucketed by PKT date |
| Avg grade | `submissions.grade` |
| Pending QA | `submissions` + `project_submissions` `status='pending'` |
| Pace | `assignments.created_at` + `deadline` |

## Build order

1. **Shared lib** — `attendance-utils.ts` + `member-progress.functions.ts` (no UI yet; verify with a quick server-fn invoke).
2. **Primitives** — `CompletionBar`, `StatusBadge`, `AttendanceStrip`.
3. **Roster** — `RosterTable` + replace `incharge.members.tsx` + new `ceo.members.tsx`. Wire export button.
4. **Drill-down** — `MemberDetailView` + three routes that pass the right `userId`.
5. **Member self-view** — `member.progress.tsx` + nav link.
6. **Excel export** — finalize two-sheet xlsx and download on click.
7. **Nav + polish** — sidebar links, RLS smoke test for each role.

## Out of scope (call out explicitly)

- No new tables, no schema changes.
- No "late" config UI — 10:00 AM PKT is hardcoded for v1.
- No working-schedule table — Sat+Sun hardcoded as off days.
- No realtime updates — relies on TanStack Query staleTime; refresh button on roster.
