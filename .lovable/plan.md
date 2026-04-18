

## Plan — Udacity-style rebrand + animations + full demo seed

### A. Visual rebrand to Udacity-style (theme + fonts)
Update `src/styles.css` and `__root.tsx`:
- Add **Sora** (display) + keep **Inter** (body) from Google Fonts. `--font-display: "Sora"`, `--font-sans: "Inter"`.
- Palette shift: black sidebar/nav (`--sidebar` near-black `#0A0A0A`), white app background, electric-blue accent (`--accent` ≈ `#2015FF`), sharp foreground. Cards stay white with subtle border + soft shadow. Rounded `--radius: 0.5rem` (Udacity is squarer than current).
- Typography rules in `@layer base`: headings use `font-display`, tighter tracking, heavier weight; body Inter 15–16px.
- Apply `font-display` to all `h1/h2/h3` plus dashboard hero numbers (CEO stat values, course titles, lesson titles).

### B. Smooth animations everywhere
- `src/styles.css`: add reusable utilities — `.animate-fade-in`, `.animate-scale-in`, `.hover-lift` (translate + shadow), `.press` (active:scale).
- `AppShell.tsx`: animated active nav pill, sidebar item hover slide, mobile drawer slide-in.
- `tabs.tsx`: animate content switch with `data-[state=active]:animate-fade-in`; animated underline on triggers.
- `card.tsx`: optional `interactive` variant with `hover-lift transition-all`.
- `button.tsx`: add `active:scale-[0.98] transition-transform` to base.
- Page mount: wrap each route's main content in `animate-fade-in` (via AppShell `<main>`).
- Progress bars: `transition-[width] duration-700 ease-out`.

### C. Full demo seed (the 12 pillars from your doc)

**Franchises** (3): IRM Sargodha, IRM Lahore, IRM PDK.

**Auth accounts** (24, password `Academy@123`):
- `ceo@irmacademy.test` — CEO
- `incharge.sargodha@irmacademy.test`, `incharge.lahore@…`, `incharge.pdk@…` — Incharges
- `member01..member20@irmacademy.test` — Members spread across 3 franchises
- `you@irmacademy.test` — your personal demo member (Sargodha) with rich progress

**12 Courses** (your exact pillars, all `published`):
1. Software Operation
2. Comprehension
3. Storyboarding & Pre-Production Thinking
4. Pacing & Editorial Rhythm
5. Typography & Text Design
6. Color & Visual Consistency
7. Caption & Text Accuracy
8. Sound Design & Audio
9. Format-Specific Editing
10. Motion Graphics & Animation
11. AI Tools & Workflow
12. File & Export Management

Each course: description from your doc + Unsplash thumbnail + **3 sections × ~5 lessons** = ~15 lessons. Lesson types mixed: video (placeholder mp4 URL like Google's sample BBB), PDF (placeholder URL), 1 quiz (3 MCQs derived from your benchmark text), 1 practical (brief = your "Benchmark" paragraph).

**Assignments**: All 12 courses → all 21 members. Mix of `mandatory` / `recommended`, ~half with deadlines.

**Progress + submissions** (the visual richness):
- Members 1–5: ~80% across 3–4 courses, several practicals approved with grades 75–95 + feedback.
- Members 6–10: ~40%, 1–2 pending submissions waiting on Incharge queue.
- Members 11–20: 0–25%, fresh learners.
- **`you@irmacademy.test`**: 60% on 4 courses, 2 graded practicals (1 approved 88/100 with feedback, 1 revision-requested), 1 still pending review — so the Incharge queue, member dashboard, and franchise progress all light up immediately.

### Implementation pieces (technical)
1. **CSS/font/theme** edit in `styles.css` + `__root.tsx`.
2. **Animation utilities** added in `styles.css`; apply classes to AppShell, Tabs, Card, Button.
3. **Server function** `src/server/seed-demo.ts` using `createServerFn` + `SUPABASE_SERVICE_ROLE_KEY` to:
   - Create the 24 auth users via `supabaseAdmin.auth.admin.createUser({ email_confirm: true })` (idempotent: catch "already registered").
   - Insert franchises, set incharge `manager_id`, update each profile's `franchise_id` + `full_name`, insert `user_roles`.
4. **SQL data migration** for everything that doesn't need auth: 12 courses + 36 sections + ~180 lessons + ~250 assignments + ~600 progress rows + ~30 submissions. Uses subqueries against `auth.users` by email so it links to users created in step 3. Idempotent via `ON CONFLICT DO NOTHING` and existence checks.
5. **One-shot seeder UI** at `/ceo/seed`: a single "Seed demo data" button (CEO-only). Calls the server function, then runs the data SQL via a second server function. Shows success + the credential list.

### Order of execution after approval
1. Apply theme + fonts + animations (visible immediately, no data needed).
2. Build seed server functions + `/ceo/seed` page.
3. You log in as CEO → click "Seed demo data" → I hand you the full credential list in chat.
4. You explore as CEO, as `incharge.sargodha`, and as `you@irmacademy.test`.

### Files to be created / edited
- edit `src/styles.css` (theme, fonts, animation utilities)
- edit `src/routes/__root.tsx` (Sora font link)
- edit `src/components/AppShell.tsx` (animated nav, mobile drawer)
- edit `src/components/ui/tabs.tsx`, `card.tsx`, `button.tsx` (animation polish)
- edit `src/routes/ceo.index.tsx`, `member.index.tsx`, `incharge.index.tsx` (display font on headings/numbers)
- new `src/server/seed-demo.ts` (server fn — auth users + franchises + roles)
- new `supabase/migrations/<ts>_seed_demo_content.sql` (courses, sections, lessons, assignments, progress, submissions)
- new `src/routes/ceo.seed.tsx` (one-shot seed button page)
- edit `src/components/AppShell.tsx` nav to add "Seed demo" link (CEO only, hidden after seed)

