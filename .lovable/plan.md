## Goal

When clicking **Generate credentials**, both the email and the temporary password should be filled in automatically (currently only the password is). The same dialog is already shared with the Incharge → Members screen, so the change benefits both flows.

## Changes — `src/components/ceo/FranchisesAndInvitesSection.tsx` (`CreateAccountDialog`)

### 1. Reorder fields so Full name is captured *before* Generate

New top-to-bottom order inside the form:

1. **Role** (CEO scope only — Incharge scope locks to `member`)
2. **Franchise** (required for `member` / `incharge`; locked for Incharge scope)
3. **Full name** (always shown — needed to derive email)
4. **Generate credentials** button (disabled until role, franchise (if required), and full name are all set)
5. After generation: **Email** + **Temporary password** appear, both editable, each with a refresh icon to regenerate just that field
6. **Create account** submit button

### 2. Email generator

Pattern (confirmed with user): `role.firstname.franchise@irmacademy.app`

```text
slug(str)   = lowercase, ASCII-only, strip everything except a-z0-9, max 24 chars
firstName   = first whitespace-separated token of Full name
franchise   = slug of the selected franchise's name (lookup by id)

CEO  → ceo.{firstname}@irmacademy.app
QA   → qa.{firstname}@irmacademy.app
Incharge → incharge.{firstname}.{franchise}@irmacademy.app
Member   → member.{firstname}.{franchise}@irmacademy.app
```

If the generated local-part is empty after slugging (e.g. name is all non-ASCII), fall back to `role.user{4-random-digits}.{franchise}`. The Email field stays editable so the operator can tweak before submitting.

### 3. Regenerate behaviour

- **Generate credentials** button → fills email + password, flips the form to the editable state.
- Refresh icon next to **Email** → re-derives the email (useful if user edits Full name afterward).
- Refresh icon next to **Temporary password** → already exists, unchanged.
- Changing Role, Franchise, or Full name after generation does NOT auto-overwrite the email (user may have edited it) — the refresh icon is the explicit way to regenerate.

### 4. Validation

- Generate button disabled unless: role set, franchise satisfied (when required), full name non-empty.
- Submit button keeps existing checks (`email`, `fullName`, `franchiseSatisfied`).

## Incharge flow

`src/routes/incharge.members.tsx` already mounts the same `CreateAccountDialog` with `callerScope="incharge"` and `lockFranchiseId={profile.franchise_id}`. With the reorder above:

- Role is hidden (locked to `member`)
- Franchise is hidden (locked to the Incharge's own franchise)
- Incharge sees: Full name → Generate credentials → auto-filled Email + Password → Create

No code changes needed in `incharge.members.tsx` — it inherits the new behavior automatically.

## Out of scope

- No DB / server-function changes. `createUserAccount` already accepts an email; we just pre-fill it on the client.
- No collision check against existing users — the email field remains editable, so the operator can resolve any duplicate before submitting (the server already returns a clear error on conflict).
