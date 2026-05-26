# Make all logins work

The root reason QA logins fail to sign in (and likely why creation has been flaky) is the auto-generated email uses `@irmacademy.test`. Supabase Auth validates the email domain and rejects `.test` TLDs in many configurations — the user is created in some cases but cannot sign in, and in other cases creation itself silently fails. Other roles (CEO/incharge/member) sign in fine because those accounts use real demo domains, but the new "must change password" flow has no enforcement, so even when a QA does sign in they land on `/qa` with the temp password still active.

## What to change

### 1. Use a deliverable email domain for generated QA logins
In `src/routes/ceo.qa.tsx` (the `generatedEmail` memo) switch the suffix from `@irmacademy.test` to a real domain Supabase accepts. Two options, pick the safer one:
- `@qa.irmacademy.app` (matches the published `.app` style — works if the CEO never needs to receive the email, which is the case here since credentials are shown in the success popup).
- Allow the CEO to enter / confirm a custom email instead of fully auto-generating, with the auto-suggestion pre-filled.

Default to the first (`.app` subdomain) so the flow stays one-field-only as the user asked.

### 2. Harden `createQaAccount` server fn
`src/server/create-qa-account.ts`:
- If `supabaseAdmin.auth.admin.createUser` returns an error like "Email address … is invalid", surface it verbatim in the dialog (already wired, just make sure we don't swallow it).
- Add a guard: if the email domain ends in `.test`, `.example`, `.invalid`, `.localhost` → reject early with a clear message.
- Confirm `must_change_password: true` is set in `user_metadata` (already there) so the client can detect it.

### 3. Enforce password change on first sign in
- `src/routes/login.tsx`: after `signInWithPassword` succeeds, read `data.user.user_metadata.must_change_password`. If true, navigate to `/change-password` instead of the role home.
- `src/routes/change-password.tsx`: after successful update, clear the flag (already does `data: { must_change_password: false }`) and then route to `homeForRole(primaryRole)`.
- Add a small guard in `__root.tsx` (or per-role layout) so a signed-in user with `must_change_password=true` is redirected to `/change-password` from any other route.

### 4. Verify all four role logins end-to-end on the **Published** URL
Preview's fetch proxy is known to break Supabase `/auth/v1/token` calls (see the Lovable troubleshooting note). Verification will be done against `https://plan-build-efficient.lovable.app/login` for:
- `ceo@irmacademy.test` (seeded demo)
- `incharge.sargodha@irmacademy.test` (seeded demo)
- `member01@irmacademy.test` (seeded demo)
- A freshly created QA account from the CEO → QA page

For each, confirm: sign-in succeeds → lands on correct dashboard (`/ceo`, `/incharge`, `/member`, `/qa`) → QA additionally goes through `/change-password` first.

### 5. Note on the seeded demo accounts
The seeded users also use `@irmacademy.test`, but those were inserted directly through the seed function before Supabase's email validator ran on the admin path, so they continue to work for sign-in. Only **newly created** users through `admin.createUser` trip the validator. We're not touching the seed data.

## Files touched
- `src/routes/ceo.qa.tsx` — change generated email suffix
- `src/server/create-qa-account.ts` — add domain guard + clearer error
- `src/routes/login.tsx` — redirect to `/change-password` when flag is set
- `src/routes/change-password.tsx` — route to role home after success (verify)
- `src/routes/__root.tsx` (or role layout) — global guard for the flag

## Out of scope
- No schema changes, no new tables, no auth provider changes (no Google OAuth added).
- Preview-environment auth flakiness is a Lovable platform issue; we won't try to work around it — testing happens on the Published URL.
