## Goal

Mirror the QA "share credentials" UX in the **Create account** dialog (used on the CEO Franchises page and Incharge Members page), so you can copy and paste the credentials into WhatsApp/email — exactly like the QA flow.

## What changes

In `src/components/ceo/FranchisesAndInvitesSection.tsx`, inside `CreateAccountDialog`:

1. **Inline copy buttons** next to the auto-generated **Email** and **Temporary password** fields (appear as soon as you click *Generate credentials*). Each copies just that value. A third **Copy share-text** button appears under the password and copies the full ready-to-send message:

   ```
   IRM Academy login

   Name: {fullName}
   Email: {email}
   Temporary password: {password}

   Sign in at {origin}/login — you'll be asked to change your password on first sign-in.
   ```

   This lets you copy and send the credentials immediately, before even submitting — matching the QA flow's intent.

2. **Post-create success view** — already implemented but apparently not showing. The plan keeps it and additionally surfaces any failure clearly:
   - Wrap the `createFn` call in `try/catch` and `toast.error` on any thrown error (right now an unexpected throw silently leaves the dialog stuck on the form with no feedback).
   - Log the error to the console so we can diagnose if Unauthorized or another server error is still occurring.
   - On success, continue to show the existing `result` view with `Email`, `Password`, and **Copy share-text** + **Done** buttons (already coded — lines 560-586).

3. **No backend changes.** Pure UI + error-surfacing in the existing client component. The Incharge Members page inherits this automatically since it mounts the same `CreateAccountDialog`.

## Why this fixes your report

You said "the copy section does not show". Two likely causes, both covered:
- Submit is failing silently → the new try/catch + toast will reveal the error so we can fix it (and you'll still have copy access via the inline buttons).
- You want to copy *before* submitting (like QA where the message is right there) → the inline **Copy share-text** button under the generated password gives you that immediately.

## Out of scope

- No changes to `src/server/admin-users.ts`, auth middleware, or email derivation rules.
- No reordering of fields (already matches your earlier spec: Role → Franchise → Full name → Generate → Email/Password → Create).
