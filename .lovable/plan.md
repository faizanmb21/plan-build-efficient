I found the QA login flow is not reliably creating the account because the current server function is a custom QA-only path with fragile auth/admin-secret handling, and the UI only shows the credentials card after a successful response. So when creation fails, no generated password or copy box can appear.

Plan:

1. Replace the fragile QA creation call with the already-working admin account creation pattern
   - Generate both email and password automatically in the app.
   - Send the generated email, generated password, full name, role `qa`, and selected centre scope to the server.
   - Reuse the existing `createUserAccount` server function pattern that already creates auth users, profiles, roles, and returns the password.

2. Fix QA centre assignment persistence
   - After the QA user is created, save the selected centre(s) into `qa_franchise_assignments`.
   - If “Org-wide” is selected, save no assignment rows so the existing org-wide QA logic still applies.
   - Make assignment insert use the CEO as the assigner where available.

3. Make the success popup impossible to miss
   - Replace the inline success card with a modal popup after creation.
   - Show: QA name, generated email, generated password, and sender/share message.
   - Add one copy button that copies all details in a clean message.

4. Improve visible error handling
   - Show the exact create failure in the dialog instead of only a toast.
   - Keep the dialog open on failure so the CEO can retry.
   - Do not close the create dialog until the backend confirms success.

5. Verify the real flow
   - Create a QA login from `/ceo/qa`.
   - Confirm a new QA auth user exists.
   - Confirm the QA role exists.
   - Confirm selected centre assignments are saved.
   - Confirm the credentials popup appears with the generated password and copy action.

Technical notes:
- I will not edit generated backend client/type files.
- I will keep roles in `user_roles`, not profiles.
- The fix will be limited to the QA login creation flow and its server-side support.