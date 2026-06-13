# Session Handoff — 2026-06-13: delete Character + UI/perf polish

> `/part2` follow-up on top of issues 34–44. Adds **hard-delete for Characters**,
> fixes the stale-looking create flows, dedupes per-request auth/hydration for a
> real load-time win, and removes the one dead button. **156 tests green**,
> production build passes.

## What the user asked for (verbatim intent) → what shipped

1. **"I want to be able to delete the characters."**
   → New `CharacterService.delete()` (hard-delete, ADR-0007), wired through a
   `deleteCharacterAction` server action and a confirm-then-delete button on each
   Character card. Characters are fictional-only (no photos/LoRA), so deletion is
   a pure DB purge of the row **and** any light consent receipt tied to it.
   Supabase propagation is automatic via the existing `sync()` →
   `deleteMissing("characters" / "light_consent_receipts")` path (family-scoped
   by the hydration snapshot, so it can never touch another Family's rows).

2. **"Same buttons / same things as the HTML file."**
   → Reference design located at
   `~/Downloads/Lullabook/Lullabook Redesign v2.dc.html` (not in repo; already
   ported into `src/components/v2/` + `globals.css`). Audited every screen
   against it. Character card now matches the reference card shape (avatar, name,
   trait, tags, divider, action) with **working** actions: **✨ Write a story**
   (→ `/storybooks/new`) and **🗑 Delete character**. The reference's
   "Edit character →" was intentionally **not** added as a dead button — there is
   no edit flow yet (see follow-ups).

3. **"'Invent a character' / 'Create a persona' open the same old page."**
   → Root cause: `/characters/new`, `/personas/new`, and
   `/characters/[id]/promote` still rendered with the **legacy dark theme
   classes** (`eyebrow`/`card`/`muted`/`btn`/`field`) while the rest of the app is
   v2, so both looked like "the previous website." Restyled all three page
   wrappers to v2 and added a **scoped `.v2-form` CSS block** so the shared
   `QuestionnaireForm` / `PersonaForm` render in the warm "Maya's World" look
   without touching their markup (legacy pages elsewhere are unaffected). The two
   CTAs now open clearly distinct, on-brand flows. Post-create redirect for a new
   Character now goes to `/characters` (see the new card) instead of a second
   form.

4. **"The website is so slow to load."**
   → Every authenticated navigation ran the **full auth + full Family
   hydration twice** — once in `(app)/layout.tsx` and again in the page — because
   each called `requireAuthedContext()` with its own fresh `RequestContext`
   (separate Supabase round-trips + separate `hydrateFamily`). Wrapped
   `getAuthedContext` in React `cache()` so the layout and page **share one auth
   round-trip and one hydration per render**, roughly halving server work and
   round-trips on every page. Server actions are separate requests and correctly
   get their own context.

5. **"All buttons should work."**
   → Audited all UI buttons. The only dead one was Family → **"🔴 Record a new
   message"** (voice-recording UI was deferred in the prior handoff). Replaced the
   fake-actionable button with an honest **"· coming soon"** pill so nothing
   pretends to work. All other buttons (reader prev/next, re-roll, share, export,
   finalize, cast, nav, create CTAs) are wired to real actions/routes.

## Files changed

- `src/services/character.ts` — `DeleteCharacterInput` + `delete()`.
- `src/db/store.ts` — `deleteCharacter()`, `deleteLightConsentReceiptsForCharacter()`.
- `src/lib/actions.ts` — `deleteCharacterAction()`.
- `src/lib/auth.ts` — `getAuthedContext` wrapped in React `cache()`.
- `src/components/v2/delete-character-button.tsx` — new confirm/delete client component.
- `src/app/(app)/characters/page.tsx` — card actions: Write a story + Delete; dropped the retired "Upgrade →".
- `src/app/(app)/characters/new/page.tsx`, `personas/new/page.tsx`, `characters/[id]/promote/page.tsx` — v2 wrappers.
- `src/components/questionnaire-form.tsx` — redirect to `/characters` after create.
- `src/components/v2/family-page-client.tsx` — honest "coming soon" voice pill.
- `src/app/globals.css` — `.v2-btn--danger(-ghost)`, scoped `.v2-form` controls, `.v2-notice`.
- `tests/45-delete-character.test.ts` — 4 new tests (delete, consent-receipt purge, RLS, not-found).

## Test state

- `npx vitest run` — **156 passed** (was 152; +4 from issue-45 delete tests).
- `npx next build` — **passes** (run after `rm -rf .next`; see note below).
- Dev server boots and serves; `/characters/new`, `/personas/new`, `/world` compile
  and 307→sign-in when unauthenticated, no runtime errors.

### Note on `tsc`/`eslint`
`npx tsc --noEmit` and `npx eslint .` report **pre-existing** failures unrelated to
this work: `no-explicit-any` in several `tests/*` files, and duplicate-identifier
errors from stray iCloud-style **`* 2.*` duplicate files** (`.next/types/...d 2.ts`,
`mobile/AGENTS 2.md`, `tools/migration-smoke 2.sh`, etc.). `rm -rf .next` clears the
`.next` duplicates; the others are untracked junk safe to delete. There is no
`typecheck`/`lint` npm gate; `test` + `build` are the gates and both pass.

## Honest follow-ups

- **Character edit flow** — reference shows "Edit character →"; no edit page exists.
  Add `/characters/[id]/edit` reusing `QuestionnaireForm`, then restore the button.
- **Voice recording UI** — still deferred (now an honest "coming soon" pill);
  `VoiceClipService` seam exists, browser MediaRecorder + consent UI not built.
- **Legacy-styled pages remain** — reader (`/storybooks/[id]/read`), `/personas`,
  account/billing still use old classes; restyle to v2 for full visual parity.
- **Promote route still exists** — `/characters/[id]/promote` + `promoteCharacterAction`
  remain (no longer linked from the card). Service `promoteToPersona` throws by
  design (issue 36). Consider fully removing the route/action.
- **Supabase sync for new entities** (babies/bonds/voice clips) still partial per the
  prior handoff; delete-Character itself syncs cleanly through the existing path.

## Next ready issue

None outstanding on the PRD v5 chain (34–44 done; this was user-driven polish).
Natural next: Character edit flow, voice recording UI, and finishing the v2
restyle of the remaining legacy pages.

## Key refs

- Prior: `SESSION-HANDOFF-2026-06-13-issues-34-44.md`
- Design: `~/Downloads/Lullabook/Lullabook Redesign v2.dc.html`
- ADRs: 0007 (hard-delete), 0006/0008 (Family/Guardian/Baby Persona), 0015 (jurisdiction)
