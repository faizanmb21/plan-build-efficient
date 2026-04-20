

## Plan: Multi-select courses + multi-select members for CEO Assign page

Mirror the Incharge multi-assign UX in the CEO portal so the CEO can pick **multiple courses** and assign them to **multiple members**, a **whole franchise**, or **everyone** in one go.

### Changes to `src/routes/ceo.assign.tsx`

**1. Replace single `courseId` with `courseIds: string[]`**
- Swap the single course `<Select>` for a popover-based multi-select with checkboxes (same pattern as `incharge.assign.tsx`).
- Show selected courses as removable chips above the picker.
- Search box inside the popover to filter by title.

**2. Replace single `memberId` with `memberIds: string[]`** (for the "Members" scope)
- Rename scope option from "Single member" → **"Selected members"**.
- Popover with checkbox list, search by name, shows franchise next to each member.
- Selected members rendered as removable chips.
- Keep "Whole franchise" and "Everyone" scopes unchanged.

**3. Bulk insert logic in `handleAssign`**
- Build `targetUserIds` from scope (selected members / franchise members / all members).
- Build `rows` as the cartesian product: `courseIds × targetUserIds`, each row carrying `priority`, `deadline`, `assigned_by`.
- Pre-fetch existing `assignments` for `(course_id IN courseIds, user_id IN targetUserIds)` and **skip duplicates** client-side (same approach as Incharge) so the user sees a clear "X assigned, Y skipped (already existed)" toast instead of a unique-constraint error.
- Insert remaining rows in one `.insert(rows)` call.

**4. Validation + UX polish**
- Disable Assign button until at least one course AND a valid target is chosen.
- Toast summary: `"Assigned 12 (3 courses × 4 members). Skipped 2 duplicates."`
- Reset selections after success and reload the recent-assignments table.

### What is NOT changing
- Database schema, RLS policies, `assignments` table — no migration needed (the existing `(course_id, user_id)` unique constraint is what we work around).
- `src/routes/ceo.tsx` sidebar entry, `incharge.assign.tsx`, and the recent-assignments table layout stay as is.

### Verification
1. Log in as CEO.
2. Go to **Assign** → pick 2–3 courses, pick "Selected members", check 3 members across different franchises, set Mandatory + a deadline, click Assign.
3. See toast `"Assigned 9 (3 courses × 3 members)"`; new rows appear in Recent.
4. Re-run with overlapping selections → see `"Skipped N duplicates"`.
5. Try **Whole franchise** with multiple courses → all members of that franchise get all selected courses.
6. Try **Everyone** with 1 course → every member gets it.

