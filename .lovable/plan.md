
## Goal

Today the dashboards mostly show donut pies and counters. They look pretty but don't actually answer the two questions you keep asking:

- **Incharge:** "How is each of my members doing right now, and who needs my attention this week?"
- **CEO:** "How is each franchise (and each incharge) performing vs the others, and which members across the academy are at risk?"

We rebuild both dashboards around those questions. Pies stay (you like them) but become *one* signal among several — they sit beside ranked tables, attention lists, and trend bars.

---

## What changes

### 1. Incharge dashboard (`/incharge`) — "Members at a glance"

Replace the current grid of identical pies with a denser, more useful console:

```text
┌─────────────────────────────────────────────────────────────┐
│ Hero strip: Members | Pending reviews | Avg % | Pass rate   │
├──────────────────────┬──────────────────────────────────────┤
│ Franchise donut      │ This week                            │
│ (A+/A/B/C mix)       │ • X submissions graded               │
│ + avg % center       │ • Y still pending (oldest: 4d)       │
│                      │ • Z redos issued                     │
├──────────────────────┴──────────────────────────────────────┤
│ Needs attention (auto-ranked)                                │
│   - Members with redo rate > 30% or no submission in 14d    │
│   - Pending submissions older than 3 days                   │
├─────────────────────────────────────────────────────────────┤
│ Member leaderboard (sortable table)                         │
│   Name | Pie | Graded | Avg% | Pass% | Last activity | →   │
│   sort by avg desc by default; click row → drill            │
├─────────────────────────────────────────────────────────────┤
│ By pillar / course (mini-bars)                              │
│   Each pillar shows avg% bar + redo count for the franchise │
└─────────────────────────────────────────────────────────────┘
```

Key behaviour:
- The **Needs attention** section is the new heart of the page — it surfaces who to talk to *today*, not just totals.
- The **member leaderboard** keeps a small pie per row (40px) plus the numeric KPIs so you can scan 20 members in one screen instead of scrolling a 3‑col pie grid.
- "Last activity" combines last submission and last study session so you spot ghosts.
- Clicking a member opens the existing `MemberGradeReport` dialog (already built).

### 2. CEO dashboard (`/ceo`) — "Academy at a glance"

Same shape, one level higher:

```text
┌─────────────────────────────────────────────────────────────┐
│ Hero strip: Franchises | Members | Pending grading | Avg %  │
├─────────────────────────────────────────────────────────────┤
│ Academy donut (org-wide grade mix) + 7‑day delta            │
├─────────────────────────────────────────────────────────────┤
│ Franchise leaderboard                                        │
│   Franchise | Incharge | Members | Pie | Avg% | Pass% |     │
│   Pending | Last graded | →                                  │
│   sortable; click row → /ceo/franchises/$id                 │
├─────────────────────────────────────────────────────────────┤
│ Incharge scorecard                                           │
│   Per-incharge: graded this week, avg turnaround time,      │
│   pending older than 3 days, redo rate they issue           │
├─────────────────────────────────────────────────────────────┤
│ Members needing attention (academy-wide, top 10)            │
│ Pillar coverage (avg% bar per course across academy)        │
└─────────────────────────────────────────────────────────────┘
```

Key new pieces for the CEO:
- **Franchise leaderboard** lets you compare Sargodha vs Lahore vs PDK on one row each instead of clicking into each franchise.
- **Incharge scorecard** is brand new — measures the *grader*, not just the members. It uses `submissions.reviewed_by`, `created_at` and `reviewed_at` to compute:
  - graded in last 7 days
  - average turnaround (created → reviewed)
  - pending older than 3 days in their franchise
  - redo % they're issuing (sanity check that nobody is too lenient or too harsh)
- **Members needing attention** rolls the same risk rules up across all franchises so you immediately see the worst 10 across the whole academy.

### 3. Member dashboard (`/member`) — small polish

Keep the existing personal donut, but add a "Where you stand" line:
- Your avg % vs your franchise avg vs the academy avg
- Your rank in your franchise (e.g. "5th of 8")
- Next pillar to focus on (the pillar where you currently have the lowest avg or no submission yet)

This gives a member the same kind of signal the incharge gets.

### 4. Shared "attention" logic

Add `src/lib/progress-signals.ts` so all three dashboards use the same rules (no drift):

- `computeMemberRisk(agg, lastActivityAt)` → `{ level: 'ok'|'watch'|'at_risk', reasons: string[] }`
  - `at_risk` if redo rate > 30%, or pending > 3d, or no submission in 14d, or avg < 70
  - `watch` if redo rate > 15%, or no submission in 7d, or avg < 80
- `computeIncharge KPIs(submissions)` → graded7d, avgTurnaroundHours, oldestPendingDays, redoIssueRate
- `computeFranchiseSummary(memberAggs, sessions)` → rolled up KPIs

### 5. Reports

The full `.xlsx` export already covers everything we'd need; nothing changes there. We only add a "Download this view" CSV button on each new section so you can grab the leaderboard or the attention list directly without going to `/ceo/grades`.

---

## Technical notes

- **No schema changes.** Everything is derived from `submissions`, `profiles`, `user_roles`, `franchises`, and `study_sessions`, which are all already queried.
- **One extra query per dashboard:** `study_sessions` (latest `started_at` per user) for the "last activity" column. RLS already allows incharge/CEO to read franchise/all sessions.
- **Reuse existing pieces:** `aggregateGrades`, `combineAggregates`, `GradePieCard`, `MemberGradeReport`, `buildGradesWorkbook`. No new charting library.
- **Files to create:**
  - `src/lib/progress-signals.ts` — risk + incharge KPI helpers
  - `src/components/dashboard/AttentionList.tsx`
  - `src/components/dashboard/MemberLeaderboard.tsx`
  - `src/components/dashboard/FranchiseLeaderboard.tsx`
  - `src/components/dashboard/InchargeScorecard.tsx` (CEO-only)
  - `src/components/dashboard/PillarCoverageBars.tsx`
- **Files to edit:**
  - `src/routes/incharge.index.tsx` — recompose around the new components
  - `src/routes/ceo.index.tsx` — add franchise leaderboard, incharge scorecard, attention list
  - `src/routes/member.index.tsx` — add the "Where you stand" strip

The existing `Pillar Flower → Pies` work stays intact; this plan **adds context around the pies**, it doesn't rip them out again.

---

## Out of scope (can do later if you want)

- Per-member trend charts over time (would need to build a small daily roll-up).
- Email/Slack alerts for at-risk members.
- AI-generated weekly summary of the franchise.
