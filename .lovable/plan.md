## Goal

On the incharge dashboard:
1. Remove the 12-pillar flower visualizations (both franchise-wide and per-member).
2. Replace them with grade-based **pie charts** (donuts) showing the letter-grade distribution (A+ / A / B / C) per member, plus one franchise-wide pie.
3. Seed the **IRM Lahore** franchise so the chart has data: ensure ~10 members and create graded submissions per member with a varied mix so the pies look meaningful.

The CEO dashboard's flower stays untouched (only the incharge view is changed).

## Why pie charts

The current flowers show "pillar mastery" — an abstract aggregate that has nothing to do with the new A+/A/B/C grading the incharge actually issues. A donut showing how many of a member's submissions are A+/A/B/C maps 1-to-1 with what the incharge graded, which is what they want to see at a glance.

## Changes

### 1. `src/routes/incharge.index.tsx` — swap visualizations

- Remove imports of `PillarFlower`, `getPillarScoresForUsers`, `PillarScores`.
- Remove the `franchiseScores` and `perMember` state and the calls that fill them.
- Add a fetch for **submissions** for the franchise's members:
  - `submissions` rows where `user_id IN (memberIds)` and `status != 'pending'` and `letter_grade IS NOT NULL`.
- Use `aggregateGrades` from `@/lib/grade-utils` to compute counts per member and franchise-wide.
- Replace the "Franchise mastery" card with a **"Franchise grades"** card containing one `CourseGradePie` showing total A+/A/B/C across all members, with center label = average %.
- Replace each per-member flower card with a `CourseGradePie` showing that member's A+/A/B/C distribution; below the donut show: total graded count, average %, pass rate. Empty members get a "No grades yet" placeholder.
- Add a small legend chip row (A+ green, A blue, B amber, C red) using `LETTER_COLORS` from `CourseGradePie.tsx`.
- Update the page subtitle from "mastery across all 12 IRM Academy skill pillars" to something like "grades issued to your team".

### 2. Seed graded submissions for IRM Lahore

Lahore franchise (`269c91e9-5ceb-4872-80ac-7267b4a30d32`) already has these 8 members:
Abdul Rehman, Arham Siddiqui, Ayesha Tariq, Fatima Noor, Iqra Yousuf, Maaz, Mehwish Anwar, Owais Mirza
(plus the Lahore Incharge).

To reach 10 members, insert 2 new profiles + member roles for Lahore:
- "Hamna Tariq"
- "Zara Khalid"

(Created as `profiles` rows with synthetic UUIDs and matching `user_roles` rows with role `member` and `franchise_id` = Lahore. No `auth.users` row is created — these are display-only seed members for the incharge view, matching how the existing Lahore members appear.)

Then, for each of the 10 Lahore members, insert 6–10 graded `submissions` rows against existing lessons from the two published courses (Capcut PC Full Editing Course 2026, Graphic Design Basics) with a deliberate mix so the pies look distinct. Approximate distribution per member:

```text
Top performers (3):  ~5 A+, 3 A, 1 B, 0 C
Strong (3):          2 A+, 4 A, 2 B, 0 C
Mid (3):             1 A+, 2 A, 3 B, 1 C
Struggling (1):      0 A+, 1 A, 2 B, 4 C
```

Each row sets: `user_id`, `lesson_id`, `status='approved'` (or `'revision'` for C), `letter_grade`, `grade` (mapped via LETTER_TO_PERCENT), `reviewed_by` = Lahore Incharge id, `reviewed_at` = recent timestamps spread over the last 30 days, `file_url` = a placeholder string. This is done as a SQL migration.

### 3. Cleanup

- Leave `PillarFlower` component and pillar libs in place (still used by CEO dashboard and possibly other views).
- No changes to `ceo.grades.tsx`, `MemberGradeReport.tsx`, or grade dialogs.

## Files touched

- **edit** `src/routes/incharge.index.tsx` — replace flower with pie charts, fetch submissions instead of pillar scores.
- **migration** — insert 2 new Lahore members (profiles + user_roles) and ~80 graded submissions across the 10 Lahore members.

## Open question

The 2 new seed members (Hamna Tariq, Zara Khalid) will be profile-only (no login), same as how the rest of the Lahore demo members appear. If you'd rather have only the existing 8 Lahore members get grades (no new seed members), say so and I'll skip step 2's profile insert and just seed grades for the 8.
