## Goal

Restructure the unified CEO dashboard so the top section visually combines the two screenshots:

- The **donut/franchise summary cards** (currently in the "Franchises" section lower down) move to the **top** of the dashboard.
- Beneath each donut, list **up to 10 members** of that franchise with their `[avatar] Name ─ grade-distribution bar ─ avg %` row (the same layout shown in screenshot 2).
- If a franchise has **more than 10 members**, show a "View all N members →" row that navigates to that franchise detail page.
- Clicking **any member row** opens the **member's grade report dialog directly on the CEO dashboard** (no navigation away), reusing the existing `MemberGradeReport` component already used in `ceo.franchises.$id.tsx`.

## New top section: "Franchise overview"

Replaces the current `InchargeMemberStrip` (which is plain text rows) and supersedes the donut cards in `FranchisesAndInvitesSection`'s grid for the active-franchise view.

Each card contains:

```text
┌──────────────────────────────────────┐
│ 🏢 IRM Sargodha                      │
│ 📍 Sargodha, Pakistan                │
│                                      │
│           [ 64% donut ]              │
│  • A+ 72  • A 64  • B 56  • Redo 61  │
│                                      │
│ 🛡 Sargodha Incharge · 👥 8 members   │
│ ───────────────────────────────────  │
│ [SJ] Sana Javed   ████████░░  85%    │ ← clickable
│ [HS] Hassan Sheikh ██████░░░░  70%   │
│ ... (up to 10)                       │
│ View all 12 members →                │ (only if > 10)
│ ───────────────────────────────────  │
│ Click for more details →             │
│ [Archive]                            │
└──────────────────────────────────────┘
```

- Donut: existing `GradePieCard` with `size={150}` and the 4-color stats already present.
- Member rows: existing `MiniAvatar` + `GradeDistributionBar` + avg percent (same primitives used today in `InchargeMemberStrip`), sorted graded-first by avg desc then ungraded by name (same sort as today).
- Member row is a `<button>` that calls `onMemberClick(memberId)` on the parent — NOT a `Link`. The parent owns a `gradeMember` state and renders the existing grade dialog.
- "View all N members →" row only renders when `members.length > 10`. Links to `/ceo/franchises/$id`.
- "Click for more details" footer link to `/ceo/franchises/$id` (preserved from current franchise card).
- Archive button preserved at the bottom of each card.

## Member grade dialog on the dashboard

Reuse the exact dialog already used in `src/routes/ceo.franchises.$id.tsx` (lines 467–479):

```tsx
<Dialog open={!!gradeMember} onOpenChange={(o) => !o && setGradeMember(null)}>
  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
    <DialogHeader><DialogTitle>Member grade report</DialogTitle></DialogHeader>
    {gradeMember && <MemberGradeReport userId={gradeMember.id} ... />}
  </DialogContent>
</Dialog>
```

State + handler live in `ceo.index.tsx`. The dashboard already has each member's `userId` and `fullName` in `inchargeBlocks`, so no extra fetching is needed to open the dialog — `MemberGradeReport` fetches its own data by `userId`.

## Sections after the change (top → bottom)

1. Header (IRM Academy)
2. KPI strip (unchanged)
3. **NEW unified "Franchise overview" grid** (donut + member list per franchise + archive action) — replaces both the current `InchargeMemberStrip` AND the donut grid inside `FranchisesAndInvitesSection`.
4. Franchises management controls — "Show archived (N)", "New franchise", "New invite" buttons + Archived list (when toggled) + Invites list. Pulled out of `FranchisesAndInvitesSection` and lives below the overview grid.
5. Course bottlenecks table (unchanged)
6. Members needing attention table (unchanged)
7. Incharge scorecard (unchanged)

## Technical changes

### `src/components/ceo/InchargeMemberStrip.tsx` — rewritten

- Renamed conceptually to a "Franchise overview" grid (filename kept to minimize churn, or rename to `FranchiseOverviewGrid.tsx` — happy with either; I'll keep the existing filename to avoid touching `ceo.index.tsx` import paths beyond what's needed).
- New props:
  ```ts
  interface FranchiseOverviewItem {
    franchiseId: string;
    franchiseName: string;
    location: string | null;
    inchargeName: string | null;
    agg: GradeAggregate;       // franchise-level aggregate for donut
    members: InchargeMember[]; // already sorted
    isArchived: boolean;
    archivedAt: string | null;
    autoDeleteAt: string | null;
  }
  interface Props {
    items: FranchiseOverviewItem[];
    onMemberClick: (userId: string, fullName: string | null) => void;
    onArchive: (id: string, name: string) => void;
    onRestore: (id: string) => void;
    onPurge: (id: string, name: string, force: boolean) => void;
  }
  ```
- Renders `GradePieCard` (size 150), the 4-color legend (A+/A/B/Redo counts) like the screenshot, member list sliced to 10, "View all N →" link when overflow, archive/restore action row, "Click for more details" link wrapping the donut+member-list area.
- Member row uses a `<button>` triggering `onMemberClick`.

### `src/routes/ceo.index.tsx`

- Extend `inchargeBlocks` build to include `agg` (franchise aggregate, already computed in `perFranchise`), `location`, `isArchived` flag — i.e. produce `FranchiseOverviewItem[]` directly. Easiest: also fetch `location, archived_at, auto_delete_at` in the franchises query (currently only `id,name,manager_id` is selected; expand to include those columns — no schema change).
- Add local state `const [gradeMember, setGradeMember] = React.useState<{id: string; name: string | null} | null>(null)`.
- Render the new grid with `onMemberClick={(id, name) => setGradeMember({id, name})}`.
- Render the grade dialog (same JSX as in `ceo.franchises.$id.tsx`).
- Move archive/restore/purge handlers up from `FranchisesAndInvitesSection` (or pass through) so the new grid can wire them.

### `src/components/ceo/FranchisesAndInvitesSection.tsx`

- Remove the active franchise donut grid (lines ~243–368).
- Keep: archived list (when `showArchived` is on), the toolbar (`Show archived` toggle, `New franchise`, `New invite` buttons), the `Invites` section, and the dialogs.
- This component becomes "Franchise admin & invites".

### Member click target (decision, per the user's "open the members chart and all details")

- Open the existing `MemberGradeReport` dialog **inline on `/ceo`**. This matches "open the member's chart and all details" — `MemberGradeReport` already shows the member's grade pie, course breakdown, and detailed submissions. No navigation away.
- The "View all N members →" overflow link still goes to `/ceo/franchises/$id` for the full franchise view.

## Out of scope

- No DB schema changes.
- No changes to `MemberGradeReport`, `GradePieCard`, `GradeDistributionBar`, or the franchise detail page.
- No changes to invites flow.
- Archived franchises continue to live in the "Show archived" toggle inside the franchise admin section, not in the new top grid.
