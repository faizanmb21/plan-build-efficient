# Fix Create-Account flow + add Delete

## Root cause of the bug
The "Copy share-text" + inline copy buttons were placed **before** the user clicks **Create account**. The user copied credentials that were never submitted, so:
- Login fails (no auth user exists)
- The People list doesn't update (nothing was created)

The QA flow only shows copy actions **after** the account is successfully created — that's the pattern to mirror.

## Changes

### 1. `src/components/ceo/FranchisesAndInvitesSection.tsx`
- **Remove** the pre-submit "Copy share-text" block and the inline Copy icons next to Email/Password in the form. Keep only the **Regenerate (↻)** icons.
- **Keep** the existing post-create success view (Email + Password + "Copy share-text" + Done) — this is the only place copying should happen, matching the QA flow exactly.
- **Wrap `submit()` in try/catch** with `console.error` + `toast.error(err.message)` so failures (e.g. duplicate email, server error) are visible instead of silently leaving the dialog stuck.
- `onCreated()` already refreshes the list on success — with the fix above it will fire because users will actually click **Create account**.

### 2. Add Delete account (CEO-only)
- **`src/server/admin-users.ts`**: new `deleteUserAccount` server fn
  - Verify caller is CEO via existing `getCallerContext`
  - Refuse if `targetUserId === callerId`
  - Delete from `user_roles`, `profiles`, then `supabaseAdmin.auth.admin.deleteUser(userId)`
  - Return `{ ok: true }`
- **People list row** (in `FranchisesAndInvitesSection.tsx`): add a trash icon button next to "Reset password", CEO-only, with a `useConfirm` destructive confirmation. On success, call the existing refresh.

## Out of scope
- No DB schema or RLS changes
- No auth/email-derivation changes
- Incharge Members page inherits the dialog fix automatically; delete-from-franchise already exists there

## Files modified
- `src/components/ceo/FranchisesAndInvitesSection.tsx`
- `src/server/admin-users.ts`
