## Goal
When the CEO clicks "Create QA login" on `/ceo/qa`, open a dialog that asks **which franchise(s) this QA should be scoped to** before the account is created. The resulting QA can only review submissions for those franchises. Leaving the selection empty = org-wide access (current behavior).

## UX flow

1. CEO clicks **"Create QA login"** (renamed from "Create demo QA login").
2. A dialog opens with:
   - **Full name** (text, optional — defaults to "QA Reviewer #N")
   - **Email** (text, auto-suggested like `qa-lahore@irmacademy.test`, editable)
   - **Franchise scope** — checkbox list of all active franchises + an "Org-wide (all franchises)" option at the top. Multi-select.
   - Auto-generated temp password shown (copy button), with regenerate.
3. On submit:
   - Create the auth user (email-confirmed, `must_change_password: true`).
   - Insert `user_roles` row with role `qa`.
   - Insert one row in `qa_franchise_assignments` per selected franchise (or none if Org-wide).
4. Dialog closes and shows the credentials card (email + temp password + copy + shareable snippet) — same component already used elsewhere.
5. The QA list below refreshes and shows the new reviewer with their assigned franchises pre-checked. Existing per-row checkbox grid + Save still works for later edits.

When that QA later logs in, the existing `qa_franchise_assignments` scoping (already enforced in `/qa/submissions` queries) restricts them to only the selected centre(s). Forced password change on first login already works via `change-password.tsx`.

## Technical changes

### 1. New server function — `src/server/create-qa-account.ts` (replace existing single-user version)
- Rename export to `createQaAccount`, accept input:
  ```ts
  { email: string; fullName: string; franchiseIds: string[] }
  ```
- Validate with Zod. Authorize: caller must have `ceo` role (use `requireSupabaseAuth` middleware + role check via `supabaseAdmin`).
- Generate a 14-char random temp password.
- `supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, must_change_password: true } })`.
- If email already exists → return `{ ok:false, error:"Email already in use" }` (no silent reset, since this is now multi-QA).
- Upsert `profiles`, insert `user_roles(role:'qa')`.
- Insert `qa_franchise_assignments` rows for each `franchiseIds[i]` (skip if empty = org-wide).
- Return `{ ok:true, email, password, userId }`.

### 2. `src/routes/ceo.qa.tsx` updates
- Replace the single "Create demo QA login" button with a button that opens a new `CreateQaDialog`.
- New `CreateQaDialog` component (inline in same file or `src/components/ceo/CreateQaDialog.tsx`):
  - Form state: name, email, selected franchise IDs, password (auto, regenerable).
  - Franchise list pulled from already-loaded `franchises` state (pass as prop).
  - "Org-wide access" checkbox at top — when checked, individual checkboxes disabled and cleared.
  - Submit calls `createQaAccount` server fn via `useServerFn`.
  - On success: close dialog, show credentials card with email/password/copy + a "Share snippet" textarea pre-filled with login instructions.
- Update the QA list query to **also fetch each QA's email** (via `supabaseAdmin.auth.admin.listUsers` is server-only — add a small server fn `listQaReviewers` that returns `{id, full_name, email, franchiseIds}`), so the existing rows show email next to name. Keep the existing per-row franchise checkbox grid + Save for edits.

### 3. No schema changes
`qa_franchise_assignments` already exists with the right shape (`user_id`, `franchise_id`). RLS for QA scoping on submissions is already in place.

### 4. Cleanup
- Remove the hard-coded `qa@irmacademy.test` / fixed password constants from `create-qa-account.ts`.
- Update empty state copy on the QA list ("No QA reviewers yet. Click **Create QA login** above.").

## Files touched
- **Edit**: `src/server/create-qa-account.ts` (rewrite with input + franchise assignments)
- **Add**: `src/server/list-qa-reviewers.ts` (server fn returning QAs with email + franchise IDs)
- **Edit**: `src/routes/ceo.qa.tsx` (new dialog, wire to new server fn, show email in rows)

## Out of scope
- Editing a QA's email (still done by deleting + recreating).
- Removing/deactivating a QA (existing flow unchanged).
- Incharge-created QAs (CEO-only, as today).
