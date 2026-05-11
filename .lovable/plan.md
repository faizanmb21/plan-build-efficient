## Goal
Drop the invite-link / invite-email flow entirely. Instead:
- **CEO** creates accounts directly for **QA, Incharge, and members** (any role) — sets email + temporary password, assigns franchise, hands credentials to the person.
- **Incharge** creates accounts directly for **members** in their own franchise.
- New user signs in with the temporary password, is prompted to change it on first login.

This is simpler operationally (no DNS, no email domain, no waiting for an invite to arrive) and lines up with how IRM actually onboards people.

## Why this works
- We already have `SUPABASE_SERVICE_ROLE_KEY` configured.
- Using `supabase.auth.admin.createUser({ email, password, email_confirm: true })` from a server function creates the auth user instantly, skips email verification, and returns the user id — we then insert the profile + `user_roles` row in the same call.
- No need for the `invites` table or `accept_invite` RPC at all.

## Plan

### 1. Build the admin-create server function
Create `src/lib/admin-users.functions.ts` with one server fn: `createUserAccount`.
- Input (Zod): `{ email, password, fullName, role: 'ceo'|'incharge'|'member'|'qa', franchiseId?: uuid }`.
- Middleware `requireSupabaseAuth` to identify the caller.
- Authorization in the handler:
  - CEO → can create any role, any franchise.
  - Incharge → can only create `member` role, franchise locked to their own `get_user_franchise`.
  - Anyone else → reject.
- Uses `supabaseAdmin` (service role) to:
  1. `auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, must_change_password: true } })`.
  2. The existing `handle_new_user` trigger creates the profile row.
  3. Update `profiles.franchise_id` + `full_name`.
  4. Insert into `user_roles (user_id, role, franchise_id)`.
- Returns `{ userId, email }` plus the temp password echoed back once so the UI can show "Copy credentials".

### 2. CEO UI — "Create user" replaces "Create invite"
In `src/components/ceo/FranchisesAndInvitesSection.tsx`:
- Rename section to **"Team & accounts"**.
- Replace the "New invite" dialog with a **"Create account"** dialog:
  - Fields: Full name, Email, Role (CEO / Incharge / QA / Member), Franchise (required for incharge/member, hidden for CEO/QA), Temporary password (auto-generated, editable, "Regenerate" + "Copy" buttons).
  - Submit → calls `createUserAccount`.
  - Success → show credentials card with **Copy email + password** button and a reminder: "Share these with the user. They'll be asked to change the password on first login."
- Remove the invites list. Replace with a **People list**: queries `profiles + user_roles` joined with `auth.users.email` via a new RPC `list_team_members()` (CEO sees all; Incharge sees their franchise).
  - Each row: name, email, role, franchise, "Reset password" + "Remove" actions.

### 3. Incharge UI — same dialog, scoped
In `src/routes/incharge.members.tsx`:
- Add "Create member" button using the same dialog component (role locked to `member`, franchise locked to incharge's franchise).
- Member list already exists — add a "Reset password" action per row.

### 4. Reset-password admin action
Second server fn: `adminResetPassword({ userId, newPassword })`.
- CEO can reset anyone; Incharge can reset members in their franchise only.
- Uses `supabase.auth.admin.updateUserById(userId, { password, user_metadata: { must_change_password: true } })`.
- UI returns the new temp password to copy + share.

### 5. First-login password change
- After sign-in in `src/lib/auth.tsx`, read `user_metadata.must_change_password`.
- If true, redirect to a new `/change-password` route that forces `supabase.auth.updateUser({ password })` and clears the flag via a tiny server fn `clearMustChangePassword()` (uses admin client to update metadata).
- Block navigation to other routes until done (guard inside `AppShell`).

### 6. Remove the invite flow
- Delete route `src/routes/invite.$token.tsx`.
- Drop the `invites` table + `accept_invite` RPC via migration (after confirming nothing else reads them).
- Remove the `Invites` UI bits from any dashboard.
- Update `src/routes/index.tsx` "Waiting for an invite" empty state → "Ask your CEO or incharge to create your account."

### 7. Auth settings
- Keep email signup **enabled** so existing flows work, but the public `/login` page becomes sign-in-only (we hide the "Sign up" toggle). Self-signup will then be possible by URL but won't grant any role — without a role the user lands on the "no role" placeholder, harmless.
- Optional: call `configure_auth` to leave auto-confirm **off** for self-signup, while our admin-create path uses `email_confirm: true` so admin-created users are pre-verified.

### 8. Launch checklist (v1)
- Fix the lingering `TSNonNullExpression` build error from earlier (sweep route files).
- Smoke test on the published URL:
  1. CEO signs in → creates an Incharge with temp password → copies creds.
  2. Incharge signs in with temp password → forced to change password → lands on `/incharge` → creates a member.
  3. Member signs in → forced to change password → lands on `/member`.
  4. CEO resets a user's password → user signs in with new temp password → forced to change again.
- Publish.

## Open questions
1. Should the temp password be **auto-generated** (12 random chars, e.g. `xkcd-style`) and shown once, or do you want to **type your own**? (I'll default to auto-generated + editable.)
2. Want the credentials card to also generate a **shareable text snippet** ("Hi {name}, your IRM Academy login: …") for WhatsApp/copy-paste? Useful in your context.
3. Confirm we can **delete the `invites` table** — anything else depending on it that I should preserve as audit history?
