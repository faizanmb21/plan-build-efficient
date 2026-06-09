# Audit + Build Plan

## What exists today

### Feature 1 — Account creation
- `createUserAccount` (in `src/lib/admin-users.functions.ts`) creates **one** account per call. No bulk variant.
- UI is a single-account dialog `CreateAccountDialog` inside `src/components/ceo/FranchisesAndInvitesSection.tsx`, also used by the Incharge screen. After success it shows one credential card with a Copy button.
- Email format is auto-derived client-side: `member.<firstname>.<franchiseslug>.<4charrand>@irmacademy.app`. Password is a 12-char random string.
- `xlsx` package is already a dependency.

### Feature 2 — QA franchise access
- QA scope lives in `public.qa_franchise_assignments(user_id, franchise_id, assigned_by, created_at)`. Empty rows = org-wide access (see `qa_can_access_franchise` RPC and the comment in `/ceo/qa`).
- `/ceo/qa` (`src/routes/ceo.qa.tsx`) **already renders per-QA franchise checkboxes inline** with a per-row **Save** button that diffs and writes to `qa_franchise_assignments`. It works but is always-open on the card — no "Edit access" modal.
- Changing assignments is pure data writes against `qa_franchise_assignments`; no RLS or password/session impact. Existing sessions stay valid.
- `/ceo/qa` is the correct location.

## What needs to be built

### Feature 1 — Bulk member creation
1. **Server fn** `createUserAccountsBulk` in `src/lib/admin-users.functions.ts`:
   - Input: `{ accessToken, franchiseId, count (1–50), namePrefix? }`.
   - Authorization: CEO can target any franchise; Incharge is forced to their own franchise and `role='member'` (mirrors existing `createUserAccount` rules).
   - Loops `count` times, generating `member<N>.<franchiseslug>.<rand>@irmacademy.app` + 12-char password + display name `Member <N>` (or `<prefix> <N>`). Picks `<N>` by counting existing members in the franchise so numbering continues.
   - Reuses the same insert path as `createUserAccount` (auth.admin.createUser → profile upsert → user_roles upsert with `role='member', franchise_id`).
   - Returns `{ ok, created: [{name, email, password}], failed: [{index, error}] }` — partial success allowed.
2. **UI** `BulkCreateAccountsDialog` (new component, sibling to `CreateAccountDialog`):
   - Inputs: franchise select (locked for incharge), count (number, 1–50), optional name prefix.
   - On submit, calls bulk fn, then renders the credentials table: Name | Email | Password | per-row Copy.
   - Top toolbar: **Copy all** (formatted `Name | Email | Password` lines) and **Download CSV** (uses `xlsx` to write a `.xlsx` — same library handles CSV via `XLSX.write(..., {bookType:'csv'})`, or just a plain `.xlsx` with one sheet; pick `.xlsx` for consistency with member-progress export).
   - Big warning: "Save these now — passwords cannot be retrieved later."
3. **Wire it in**:
   - Add a "Create bulk accounts" button next to the existing "Create account" in `FranchisesAndInvitesSection` (CEO) and in the Incharge members page (`src/routes/incharge.members.tsx`), passing `callerScope` and `lockFranchiseId` like today.

### Feature 2 — QA franchise access modal
1. Refactor `/ceo/qa` so each QA card no longer renders the checkbox grid inline. Replace with an **"Edit access"** button (and keep the existing Delete button).
2. New component `EditQaAccessDialog`:
   - Props: `qa`, `franchises`, `initialSelected: Set<string>`, `onSaved`.
   - Body: same checkbox grid currently inline, plus the existing "no selection = org-wide" hint.
   - Footer: Cancel / Save. Save reuses the existing diff-and-write logic (insert toAdd, delete toRemove on `qa_franchise_assignments`). No server fn needed; client RLS already allows CEO to manage `qa_franchise_assignments`.
3. No schema/RLS/password/session changes.

## Build order
1. Server fn `createUserAccountsBulk` (+ small Zod validator).
2. `BulkCreateAccountsDialog` component with credentials table, Copy row, Copy all, Download xlsx.
3. Wire "Create bulk accounts" button into CEO `FranchisesAndInvitesSection` and `incharge.members.tsx`.
4. Extract `EditQaAccessDialog` from `/ceo/qa`, replace inline grid with an "Edit access" button.
5. Smoke test: create 5 members into a test franchise → verify rows in `profiles` / `user_roles`, CSV downloads, Copy-all formats correctly; open a QA's Edit access, toggle franchises, save, refresh, confirm persisted and that QA session is unaffected.

## Out of scope
- Sending the credentials by email.
- Editing individual generated names/emails before creation (prefix only).
- Bulk QA edits (one QA at a time).
