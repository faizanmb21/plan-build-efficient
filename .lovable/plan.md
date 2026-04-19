
Goal: make franchise cards reliably open the franchise detail page with all member details.

What’s actually going wrong
- The URL is changing to `/ceo/franchises/$id`, but the detail view is not rendering properly.
- The main cause is route structure: `src/routes/ceo.franchises.tsx` is currently acting like a full page, while `src/routes/ceo.franchises.$id.tsx` is registered as its child route.
- In TanStack Router, a parent route with child routes should be a layout route that renders `<Outlet />`. Right now the franchises route renders the list directly and does not provide a proper child-rendering structure.
- The console error during link preload (`Cannot read properties of undefined (reading '_nonReactive')`) is consistent with the current broken parent/child route setup.
- That’s why card clicks feel broken: the link/preload starts, the URL can change, but the detail route does not mount cleanly.

Implementation plan
1. Convert `src/routes/ceo.franchises.tsx` into a layout route
- Keep the route path `/ceo/franchises`.
- Change its component to render an `<Outlet />` instead of the franchise list directly.
- This makes it the proper parent for the detail route `/ceo/franchises/$id`.

2. Move the current franchise list page into a new index child route
- Create `src/routes/ceo.franchises.index.tsx`.
- Move the existing Franchises list UI and logic there:
  - loading franchises
  - invite/franchise dialogs
  - archive/restore/delete actions
  - card hover states
  - clickable “Create your first one”
- This preserves `/ceo/franchises` as the overview page, but now in the correct TanStack route shape.

3. Keep the detail page as the child detail route
- Keep `src/routes/ceo.franchises.$id.tsx` as the destination for card clicks.
- Preserve the current detail content:
  - franchise header
  - incharge
  - member list
  - member stats (`coursesStarted`, `coursesCompleted`, `lastActive`)
  - mastery chart
- Add small resilience cleanup if needed so missing/invalid franchises show a clear not-found state.

4. Keep card navigation semantic and conflict-free
- Keep the franchise card body as a real `<Link>` to `/ceo/franchises/$id`.
- Keep action buttons outside the link so Archive/Restore/Delete do not interfere with navigation.
- Preserve hover/focus states on the clickable card body, including the “Click for more details” feedback.

5. Verify end-to-end after the refactor
- Open `/ceo/franchises` and confirm the overview list still renders.
- Click multiple active franchise cards and confirm each opens its own detail page.
- Confirm the detail page shows all member details and stats.
- Confirm archive/delete actions still work without navigating.
- Confirm hover/focus styles still appear on the clickable area.
- Confirm the preload error is gone when hovering/clicking cards.

Technical details
- Best-practice TanStack structure here is:
```text
/ceo/franchises            -> layout route with <Outlet />
/ceo/franchises/           -> index route (overview list)
/ceo/franchises/$id        -> detail route
```
- Important files to update:
  - `src/routes/ceo.franchises.tsx` — convert to layout
  - `src/routes/ceo.franchises.index.tsx` — new overview page
  - `src/routes/ceo.franchises.$id.tsx` — keep detail page, optionally polish loading/not-found
- Do not manually edit `src/routeTree.gen.ts`; it should regenerate from the file-based routes.
