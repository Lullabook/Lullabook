# Session Handoff — 2026-06-13 — "Maya's World" `/part2` build (issues 46–47 + v2 UI)

**Agent:** Cursor (TDD). **Branch:** `feat/maya-world-issues-34-44`. **Not merged to main.**
**Tests:** `npx vitest run` → **168 green** (was 156; +12). `npx next build` passes.

This was a multi-item TDD-first build off the two research specs (web/visual fidelity +
app UX/IA). Source of truth: `Lullabook Redesign v2.dc.html`. Below is exactly what shipped,
honest deferrals, and the next ready issue.

---

## What shipped (per item)

### 1. Character auto-description (issue 46) — clean TDD seam ✅
- `Character.description: string` added to `src/domain/types.ts`; mapped in
  `SupabaseDataStore` load + sync (`description ?? ""`); migration
  `supabase/migrations/005_character_description.sql`
  (`ALTER TABLE characters ADD COLUMN description text NOT NULL DEFAULT ''`).
- `AnthropicAdapter.generateCharacterDescription(questionnaire)` added to
  `src/adapters/types.ts`; deterministic `FakeAnthropic` impl (records
  `characterDescriptionCalls`); real Sonnet impl in `src/adapters/anthropic.ts`
  (`max_tokens 256`, safety system prompt); `StubAnthropic` stub.
- `CharacterService` now takes `(store, anthropic, childSafety)` — wired in
  `src/lib/context.ts` AND `src/test/fixtures.ts`. `create()` generates the
  description **and moderates it via `childSafety.checkText` before persisting**
  (no unsafe text lands in the store). Added `CharacterService.update()` (regenerates
  description on edit).
- UI: `src/app/(app)/characters/page.tsx` card body now shows `c.description`, trait
  chips from `questionnaire.topics`, an "In N stories" subtitle (counted from
  `brief.starringCharacterIds` across family books), and a single **"Edit character →"**
  affordance + kept the Delete button.
- **Test:** `tests/46-character-auto-description.test.ts` (4 tests) — fake called once,
  description persisted, not generated for rejected real-child, RLS isolation.

### 2. Seed "Maya's World" demo data (issue 47) ✅
- `seedMayaWorld(ctx, memberId)` in `src/test/fixtures.ts` — builds Baby Persona Maya;
  5 Adult Personas (Priya/Mom, Sam/Dad, Grandma Rose/Grandmother, Ava/Big sister,
  Uncle Leo/Uncle) with `FamilyRoster` bonds + nicknames + varied statuses
  (ready/training/needs-photos); 4 Characters (Coco/Pip/Mr. Moon/Bramble Bear) with
  auto-descriptions; 6 Storybooks (4 finalized, 1 draft, 1 generating) — **all writes
  go through family-scoped services**; generation uses the real
  `generate → drain → finalize` flow; the generating book is created last and left
  undrained. Statuses for Ava/Leo are downgraded *after* generation so books still
  capture ready cast.
- **Test:** `tests/47-seed-maya-world.test.ts` (4 tests) — counts (5 family / 4 chars /
  6 stories), status spread (4 finalized / 1 draft / 1 generating), member-status variety,
  RLS isolation.
- **Dev runtime injector:** `src/dev/seed-maya-world.ts` → `seedMayaWorldRuntime(ctx, member)`.
  Because the production adapters are async/durable (real fal training, liveness, Inngest)
  and can't complete inside a request, this writes **display records directly through the
  family-scoped DataStore** (personas marked `ready` w/ placeholder LoRA, storybooks w/o
  generated Pages). RLS preserved (every row gets `family_id` from the Member). Idempotent
  (bails if the family already has storybooks).
- **Server action:** `seedDemoWorldAction()` in `src/lib/actions.ts`, gated by
  `NODE_ENV==='development' && DEV_DEMO_SEED==='true'`. **Discreet "🌱 Load example data
  (dev)" button** (`src/components/v2/dev-seed-button.tsx`) shown on `/world` only when the
  gate is on.
- **CLI:** `tools/seed-demo.ts` —
  `DEV_DEMO_SEED=true npx tsx tools/seed-demo.ts <authUserId>` (hydrates the Member's family
  by Supabase auth user id, runs the seed, persists).

### 3. v2 Create composer ✅
- `src/app/(app)/storybooks/new/page.tsx` rebuilt; legacy `BriefComposer` shell replaced by
  `src/components/v2/composer.tsx` (`V2Composer`). Keeps every capability and wires the
  **existing** `generateStorybookAction` + `submitBriefWhileTrainingAction` (cold-start when
  a single still-training cast member is selected and nobody is ready).
- Theme field + 3 try-chips; cast toggles incl. Baby Persona (always starred/disabled),
  family Adult Personas, AND Characters (`brief.starringCharacterIds`); 6 story-type cards;
  4 art-style chips (`brief.artStyle`); page-count chips 8/12/16 (`brief.pageCount`); sticky
  right-rail "YOUR BRIEF" live preview + "✨ Generate story". Free text-story path kept
  (subscription warning links to `/stories/new`). `BriefComposer` retained for the Classics flow.

### 4. Stories shelf (issues, UX spec §1.3/§2G) ✅
- **Routing bug fixed:** shared `bookHref(status,id)` + `resumeHref(id,page)` in
  `src/lib/book-nav.ts` (finalized→`/read`, draft/generating/failed→`/storybooks/[id]`).
  `world/page.tsx` and `stories/page.tsx` both use it; `/stories` no longer hardcodes `/read`.
- `src/components/v2/stories-shelf.tsx` (client): **Continue reading** hero (most-recent
  finalized + Resume → reader), filter chips (All/Finalized/Drafts/Generating), full
  `BookCover` w/ cast + date meta. Subtitle now "N storybooks · M of {baby}'s cast ready to star".
- Cast labels use real names via `src/lib/cast-label.ts` (resolves persona/character display
  names, RLS-safe) instead of `storyType`.
- **Test:** `tests/48-stories-routing.test.ts` (4 tests) — status-aware `bookHref`/`resumeHref`.

### 5. Visual tokenize / parity ✅ (partial — see deferrals)
- `src/components/v2/tokens.ts` extended with `V2_RADIUS`, `V2_SHADOW`, `V2_GRADIENT`, and
  ~30 missing colors (rose/sage/teal/night-panel/voice/waveform/status/photo-placeholder/
  chip-green/etc.) from the visual spec.
- `src/components/v2/family-page-client.tsx` tokenized for the called-out items: list-row
  **1.5px border + active/inactive shadows + 13×14 pad**, photo-slot **r12 + diagonal stripe
  fill** (member gradient + initial) and `#B7A992` empty-slot text, **28-bar waveform** in
  voice rows, **cream Record pill** (`#FAF4E6`/`#2A2452`), plus voice-panel gradient / detail
  shell / muted text tokenized.
- Characters: single **"Edit character →"** → new `/characters/[id]/edit` page
  (`src/app/(app)/characters/[id]/edit/page.tsx`) reusing `QuestionnaireForm` (now supports
  `characterId` + `initial` edit mode, wired to new `updateCharacterAction`). Delete kept.
- New CSS in `globals.css`: `.v2-continue-banner*`, `.v2-filter-*`, `.v2-shelf-head`,
  `.v2-btn--ghost-light`, `.v2-composer`, `.v2-brief-rail`.

### 6. HTML design deliverable ✅
- `design/lullabook-current-design.html` — standalone, self-contained, reflects the
  **implemented** token values + component shapes for World / Stories / Create / Family /
  Characters, plus Reader as a labeled **design target**. Suitable to hand to an external
  reviewer.

---

## Honest follow-ups / deferrals

- **Reader two-pane (UX §2H / visual §2H) — DEFERRED.** `/storybooks/[id]/read` still uses
  the legacy single-column `.reader`; no back/share/export/reroll toolbar, no page dots, no
  two-pane illustration layout. Shown only as a target in the HTML deliverable.
- **Dev runtime seed produces display-only rows** — personas are `ready` with placeholder
  LoRA keys and storybooks have **no generated Pages**. Great for populating World/Stories/
  Family/Characters visuals; the Reader/curation pages for seeded books will be empty.
  Real generation needs the async fal/Inngest pipeline.
- **Duplicate v2 CSS blocks in `globals.css` NOT merged** (two blocks ~L748–1586 and
  ~L1588–2045 with `v2-header` vs `v2-topbar`, `v2-float` vs `lbFloat`). Left intact to avoid
  regressions; the active `AppShell`/`NavLinks` path uses the first block. Merge + delete dead
  `V2Header`/`V2Nav` is a clean follow-up.
- **Legacy-styled routes still dark inside the cream shell** (visual spec §3): `/account`,
  `/billing`, `/personas`, `/stories/new`, `/stories/[id]`, `/storybooks/[id]` (curation/
  generating/finalized), `/storybooks/classics*`. Deferred.
- **Voice UI** is still a non-functional placeholder (cream Record pill, "coming soon"); no
  recording/playback. Deferred per ADR (v1 records only, no cloning).
- **`Cast in a story` / `Write a story` preselect** (`?starring=` / `?characters=`) not yet
  wired into the composer (composer accepts no query preselect yet).
- `V2BookCover` (`book-card.tsx`) is now unused by `/stories` (replaced by full `BookCover`);
  could be deleted along with the unify-on-one-BookCover cleanup.

## Next ready issue

All local tracer-bullet issues `01–44` are implemented; `46` (auto-description) and `47`
(seed) shipped here. **Next ready: the v2 Reader rebuild** (UX §2H / visual §2H) — the largest
remaining parity gap and the one screen the spec calls out as fully legacy. Suggest filing it
as issue `49 — v2 two-pane Reader (back/share/export/reroll, page dots)`.

## Verify
```
npx vitest run     # 168 passing
npx next build     # passes
```
Demo locally: set `DEV_DEMO_SEED=true` + `NODE_ENV=development`, sign in, click
"🌱 Load example data (dev)" on /world (or run the CLI).
