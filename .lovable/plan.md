
Goal: make every active franchise card reliably open its detail page, while keeping archive/delete actions working and preserving the “Click for more details” hover feedback.

1. Fix the card click architecture on `src/routes/ceo.franchises.tsx`
- Replace the current clickable `<div role="button" ... onClick={navigate}>` wrapper with a real TanStack `<Link>`.
- Use the typed route path:
  - `to="/ceo/franchises/$id"`
  - `params={{ id: f.id }}`
  - `preload="intent"` for faster feeling navigation.
- Keep archived cards non-clickable.

2. Remove the brittle nested-interaction setup
- The current structure mixes a click-wrapper with inner buttons (`Archive`, `Restore`, `Delete`) and manual `stopPropagation()`.
- Refactor so the clickable area is semantic and predictable:
  - Make the main card body the link.
  - Keep action buttons in a separate footer/container outside the link for active cards.
- This avoids click conflicts and makes hover/focus states consistent.

3. Restore clear hover and focus feedback
- Apply the hover classes directly on the clickable `Link` + card surface so the whole card visibly responds.
- Ensure the “Click for more details” row animates from the same `group` parent.
- Add keyboard-visible focus ring and keep the cursor pointer on the actual clickable surface.

4. Keep the detail page as the destination for all franchise details
- The detail route already exists in `src/routes/ceo.franchises.$id.tsx`.
- Preserve the current detailed content there:
  - franchise header
  - incharge
  - member list
  - lesson stats (`coursesStarted`, `coursesCompleted`, `lastActive`)
- If needed, tighten loading/not-found handling so navigation feels more intentional.

5. End-to-end verification after implementation
- Test active franchise card click from CEO → Franchises list.
- Confirm the detail page opens for multiple franchises.
- Confirm archive/delete buttons still work without navigating.
- Confirm hover state appears across the clickable card and “Click for more details” animates.
- Confirm keyboard Enter/Space behavior still works if we keep a non-link fallback anywhere.

Technical details
- Likely root cause: the current card uses a non-semantic clickable wrapper (`div` + `useNavigate`) around nested interactive controls. That pattern is fragile and can fail intermittently.
- Best fix: use TanStack Router’s `<Link>` for navigation instead of programmatic `navigate()` on a wrapper.
- Files to update:
  - `src/routes/ceo.franchises.tsx` — primary fix
  - optionally minor polish in `src/routes/ceo.franchises.$id.tsx` if loading/error UX needs cleanup
