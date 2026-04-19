

User wants two things:
1. **Test end-to-end** — they're explicitly asking me to verify the CEO/member/incharge flows in the browser. This is a sanctioned browser-test request.
2. **Build `/incharge/grades`** — a franchise-scoped version of the CEO grades hub.

Let me check what exists for the incharge side and what data shape the franchise-scoped query needs.
<br>
The CEO grades hub at `src/routes/ceo.grades.tsx` already has 3 tabs (By member / By franchise / By course) with CSV export and a per-member drill-down via `MemberGradeReport`. For incharge, the "By franchise" tab is irrelevant (they only see one franchise). So the incharge version becomes 2 tabs: **By member** and **By course**, scoped to their franchise via `get_user_franchise(auth.uid())` (RLS already enforces this — incharges can only SELECT submissions/profiles for their own franchise, so the same queries naturally return franchise-scoped data).

`MemberGradeReport` already exists and works for any member id — RLS lets incharges read their own franchise members' submissions, so reusing it as-is is fine.

## Plan

### Step 1 — Create `/incharge/grades` route

New file: `src/routes/incharge.grades.tsx`
- Protected by `RoleGuard allow={["incharge"]}` (the parent `incharge.tsx` layout already does this).
- 2 tabs: **By member**, **By pillar**.
- **By member** table: name, total graded, A+/A/B/C counts, average %, redo count, last graded. Searchable. Click row → opens `MemberGradeReport` dialog (already exists).
- **By pillar** table: pillar/course title, members graded, submissions graded, avg %, pass rate, redo rate.
- "Download CSV" button on each tab.
- Header tile strip: total members, total graded, franchise average %, pending reviews count → links to `/incharge/reviews`.
- All queries naturally franchise-scoped by RLS — no extra `franchise_id` filter needed in the JS, but I'll add `.eq('franchise_id', myFranchise)` defensively for clarity and a tiny perf boost.

### Step 2 — Add "Grades" link to incharge sidebar

Edit `src/routes/incharge.tsx` — add `{ to: "/incharge/grades", label: "Grades", icon: GraduationCap }` to the `nav` array between "Members" and "Attendance".

### Step 3 — Browser test (after the file is created)

Sequence:
1. Navigate to `/login` → log in as `ceo@irmacademy.test` / `Academy@123`.
2. Click **Grades** in the sidebar → screenshot the 3 tabs populated.
3. Click a member row → drill-down dialog → screenshot. Click "Download CSV" → confirm download fires (toast/network).
4. Click "Open printable report" → confirm new tab opens `/ceo/grades/report?member=...`.
5. Sign out → log in as `member01@irmacademy.test` / `Academy@123` → navigate to `/member/grades` → screenshot graded submissions list.
6. Sign out → log in as `incharge.sargodha@irmacademy.test` / `Academy@123` → navigate to `/incharge/reviews` → screenshot queue. Then navigate to the new `/incharge/grades` → screenshot.

Report which views were verified populated, which (if any) were empty (likely means the seeder hasn't been run yet — in that case, instruct the user to run `/ceo/seed` first).

### Files touched

- New: `src/routes/incharge.grades.tsx` — franchise-scoped grades hub (~250 lines, mirrors `ceo.grades.tsx` structure but trimmed to 2 tabs).
- Edited: `src/routes/incharge.tsx` — add Grades nav item + GraduationCap icon import.

### Verification

- Incharge sidebar shows "Grades" → table only lists members of their own franchise.
- CSV downloads contain only their franchise's data (RLS enforces this; defensive `.eq()` reinforces).
- Per-member drill-down opens `MemberGradeReport` and works identically to the CEO view.

