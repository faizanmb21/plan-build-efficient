
# Dashboard redesign — match the uploaded mockups

The four reference screens share one visual language:
horizontal coloured completion bars + percentages, compact tables, status pills,
and KPI tiles up top. Pie charts are gone in favor of bar-driven tables.
We'll keep all current data sources and risk logic — only the UI layout and
two extra metrics (course completion %, lessons done) change.

## Visual primitives (new shared components)

In `src/components/dashboard/ProgressPrimitives.tsx`:

- `CompletionBar({ pct })` — colour-tiered horizontal bar (green ≥80, blue ≥65, amber ≥45, rose <45) with right-aligned `NN%` label. Replaces the existing `GradeDistributionBar` for completion contexts; the existing A+/A/B/C distribution bar stays for grade-mix cells.
- `StatusPill({ tone, label })` — pill in 4 tones: Strong (emerald), Good (sky), Watch (amber), At risk / Slow (rose), plus neutral On track / Active.
- `LetterGradeCell({ letter, percent })` — letter + `· NN%` coloured by grade.
- `IssueBadge({ kind, value })` — small rose/amber pill for "3 overdue", "No login 7d", "Stuck 2 wks".

## Three KPI strip variants

A reusable `<KpiTile label value subtitle tone />` with large coloured value text
matching the mockups (indigo for counts, emerald for good %, amber for warnings,
rose for negative). Replaces the current icon-side StatTile.

## CEO dashboard (`/ceo`) — image-31 + image-32

Header: "IRM Academy" + "Training Progress Dashboard · {Month YYYY}".

Top KPI strip (4 tiles):
1. Total Members — value, subtitle "N franchises"
2. Avg Training Completion — % across all assignments (NEW metric)
3. Avg Grade Score — % across all graded subs ("All graded submissions")
4. Pending to Grade — count, subtitle "Oldest: Nd"

Card 1 — **Franchise training overview** (table replacing FranchiseLeaderboard):
columns Franchise · Members · Avg Completion (CompletionBar+%) · Avg Grade
(letter+%) · Grade Distribution (existing A+/A/B/C bar, wider 200px) · Pending
(circle badge) · Status pill. Footer legend: "A+ 90%+ · A 85%+ · B 75%+ · C redo".
Status derived from existing risk logic on the franchise aggregate (Strong ≥85,
Good ≥75, Watch ≥60, At risk <60).

Card 2 — **Course-level training completion — all franchises** (NEW):
columns Course · Enrolled · Completed · Avg Completion (bar) · Avg Grade · Pass
Rate (e.g. "72/98" pill). Driven by joining `assignments` → `courses` with
`lesson_progress` and `submissions` already loaded. Sorted by avg completion
desc — clearly surfaces bottleneck courses.

Card 3 — **Members needing attention** (replaces current AttentionList):
table with avatar circle, Member, Franchise, Courses Assigned, Avg Completion
bar, Avg Grade %, Issue pill (3 overdue / No login 7d / Stuck 2 wks / Low avg).
Issue pill text comes from the reasons returned by `computeMemberRisk`, plus a
new "N overdue" derived from `assignments.deadline < now AND completion<100`.

Incharge scorecard moves below or stays — keep it but restyle to match.

## Incharge dashboard (`/incharge`) — image-33

Header: "{First name}'s franchise" + "Live progress review for {franchise}".

KPI strip (4):
1. My Members — count, subtitle "{franchise} franchise"
2. Avg Training Done — % completion of assignments
3. Avg Grade — %, subtitle context
4. Grade Queue — pending count, subtitle "Oldest Nd"

Card 1 — **Member training progress matrix** (NEW, the matrix from image-33):
rows = members, columns = Member · Overall · {one column per course taught in
this franchise}. Each course cell shows a small completion bar with %, plus a
sub-line for grade ("A+ 93%") or status ("In progress" / "Not started" /
"Pending"). Trailing column = Status pill (On track / Active / Slow / At risk).
Course columns are dynamic based on assigned courses in this franchise (cap at
~5 to fit width; overflow into a "+N more" tooltip).

Card 2 (left) — **Grade queue, sorted by urgency**:
columns Member · Course · Lesson · Waiting (e.g. "3 days") · Action pill
(Urgent ≥3d rose / Review ≥1d amber / New <1d indigo). Click row → opens
existing review dialog.

Card 2 (right) — **Franchise grade summary**:
A+/A/B/C grades each as a horizontal bar with percentage, replicating image-33's
right card. Computed from `franchiseAgg`.

Existing AttentionList + PillarCoverageBars stay below for depth.

## Member dashboard (`/member`) — image-34

Hero banner (full-width gradient card):
- Left: streak badge (circular `Nd` chip) + "Welcome back, {name}" + streak line
- Right: 4 inline metrics — My Avg %, Franchise Avg %, Rank #N, Pass Rate %

Card 1 — **My training progress — all courses** (NEW):
table with Course · Progress (CompletionBar+%) · Lessons (X/Y) · Grade (letter
coloured) · Grade % · Deadline (date, red if overdue/soon) · Status pill
(Completed / In progress / Due soon / Overdue / Not started). Replaces the
current "Continue learning hero + tabs" — that becomes a smaller "Pick up where
you left off" link inside this card's empty/hero state for the in-progress
course.

Card 2 (left) — **My grade breakdown**: A+/A/B/C as horizontal bars with
"N submissions" labels, plus "Overall average — NN%" footer. Replaces the
current donut.

Card 2 (right) — **Leaderboard — {franchise}**: top 5 peers by avg %,
highlighting "You" row. Driven by data already fetched in the peer block.

Right rail (activity / streak / upcoming deadlines) collapses into a smaller
section under Card 2 since the main content is now wider.

## Data additions

All on the client, no schema changes:

1. **Completion %** per member×course, per course, per franchise:
   compute from `lesson_progress.completed` count ÷ total lessons in the course.
   Reuse the same join the member page already does — extract into
   `src/lib/completion-summary.ts` so CEO/Incharge/Member share it.

2. **Overdue count** per member: `assignments` where
   `deadline < now AND completion% < 100`.

3. **Course-level rollups for CEO**:
   in `fetchOrgPerformance`, for each course collect: enrolled count
   (distinct user_ids in assignments), completed count (members with 100%),
   avg completion %, avg grade %, pass rate. Returned as `coursesPerformance: CourseRow[]`.

## File-level changes

### New
- `src/lib/completion-summary.ts` — `fetchCompletionByUser(userIds)` returning
  `Map<userId, Map<courseId, { done; total; pct }>>` and helpers for course/
  franchise rollups.

### Updated
- `src/components/dashboard/ProgressPrimitives.tsx`
  - Add `CompletionBar`, `StatusPill`, `LetterGradeCell`, `IssueBadge`, `KpiTile`.
  - New tables: `FranchiseTrainingTable`, `CourseBottleneckTable`,
    `MembersNeedingAttentionTable`, `MemberCourseMatrix`, `GradeQueueTable`,
    `GradeSummaryBars`, `MyTrainingTable`, `MemberLeaderboardCompact`.
  - Keep existing `MemberLeaderboard` / `FranchiseLeaderboard` /
    `InchargeScorecard` / `AttentionList` / `PillarCoverageBars` until
    everything switches over, then remove unused.
- `src/routes/ceo.index.tsx` — replace body with new KPI strip + 3 cards.
  Extend `fetchOrgPerformance` to return courses + completion rollups.
- `src/routes/incharge.index.tsx` — replace body with new KPI strip + matrix +
  grade queue + grade summary. Reuse fetched data; add completion lookup.
- `src/routes/member.index.tsx` — replace donut/peer block + tabs with new
  hero banner, training table, grade breakdown bars, mini leaderboard.

### Untouched
- `src/lib/grade-utils.ts`, `src/lib/grade-summary.ts`,
  `src/lib/progress-signals.ts`, `src/components/grading/*`, all DB schemas.

## Open question

The mockups omit the existing course-level pillar coverage bars and the
incharge scorecard. I plan to **keep** the incharge scorecard (CEO uses it for
grader management) and **drop** the standalone PillarCoverageBars (it's now
covered by the per-course completion table). Confirm if you'd rather keep both.
