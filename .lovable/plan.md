## Goal

1. Make `/ceo` (Dashboard) and `/ceo/franchises` (Franchises) render the **same unified content** so the two routes are no longer separate experiences.
2. Add a new **"Incharge & members" snapshot strip** to the top of that unified view — one card per incharge showing their members' grade overview, identical in spirit to what the Franchises page already shows, with each member clickable through to their detailed profile.

## What the unified page looks like (top → bottom)

1. **Header** — "IRM Academy" greeting + Training Progress label.
2. **KPI strip** (existing) — Total Members · Avg Completion · Avg Grade · Pending to Grade.
3. **NEW: Incharge & members snapshot** (top, per the user's request)
   - One card per active franchise/incharge.
   - Card header: incharge name, franchise name, member count.
   - Body: a horizontal bar list — one row per member with `[avatar] Name ───── grade-distribution mini-bar  ──  avg %`. Bar is the same `GradeDistributionBar` (A+ / A / B / C / Redo) already used elsewhere, sized per member. Members with no graded work show a muted empty bar.
   - Each member row is a `Link` to `/ceo/franchises/$id` (existing member-detail surface used from the franchise card grid) — clicking a member navigates to that member's detailed profile view.
   - Card footer: "Open franchise →" link to `/ceo/franchises/$id`.
   - Empty state: "No incharges assigned yet."
4. **Franchise cards grid** (moved over from `/ceo/franchises`)
   - Existing card layout: pie chart, incharge name, member count, "Click for more details", Archive/Restore/Delete actions.
   - "Show archived (N)", "New franchise", and "New invite" buttons live in this section's header.
5. **Invites list** (moved over from `/ceo/franchises`) — unchanged.
6. **Course-level training completion** table (existing on dashboard).
7. **Members needing attention** table (existing on dashboard).
8. **Incharge scorecard** (existing).

The previous standalone "Franchise training overview" table on the dashboard is **removed** — the franchise cards above already show the same info more visually, and removing it eliminates the duplication the user flagged.

## Routing

- Both `/ceo` and `/ceo/franchises` are kept (per the user's choice "Keep both routes but unify content").
- Implementation: extract the merged view into a single component `CeoOverview` rendered by both `ceo.index.tsx` and `ceo.franchises.index.tsx`. The sidebar keeps both links so deep-links (and existing bookmarks like the "Open franchises" buttons elsewhere in the app) keep working; they now land on the same content.
- The franchise-detail route `/ceo/franchises/$id` is untouched.

## Technical notes

- Create `src/components/ceo/CeoOverview.tsx` containing all sections above. Move the data-fetching from `ceo.index.tsx` (`fetchOrgPerformance`) and the franchise/invite CRUD from `ceo.franchises.index.tsx` into this component (or split into two hooks: `useOrgPerformance`, `useFranchisesAndInvites`).
- Add a new derived structure in `fetchOrgPerformance` (or a sibling query): for each franchise with a manager, list its members with `{ id, full_name, agg, avgPct }`. The data is already fetched (profiles, roles, submissions, completion summary) — just shape it.
- New presentational component `InchargeMemberStrip` rendering the per-incharge cards and the per-member bar rows. Reuses existing `GradeDistributionBar`, `MiniAvatar`, `LetterGradeCell`.
- Member row link target: `/ceo/franchises/$id` (the franchise detail page, where individual member profiles are already viewable). If a different per-member route exists I'll wire to that instead — confirmed via the codebase that member detail lives inside franchise detail.
- `ceo.index.tsx` and `ceo.franchises.index.tsx` become thin wrappers: `export const Route = createFileRoute(...)({ component: () => <CeoOverview /> })`.
- No DB schema changes. No new RLS. No new server functions.

## Out of scope

- No changes to incharge / member / QA dashboards.
- No change to franchise-detail page or member-profile page.
- No changes to seeded data.