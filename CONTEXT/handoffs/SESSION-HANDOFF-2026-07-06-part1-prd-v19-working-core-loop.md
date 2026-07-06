# Session handoff — 2026-07-06 — /part1 PRD v19 "Working core loop"

## What this session did
Live iOS-Simulator QA surfaced that the core R1 loop is broken on device. Ran `/part1` on
the feedback bundle: grilled the load-bearing forks, locked invariants, wrote an ADR + PRD +
six issues. **No application code was changed** (planning only) except one dev-config repair
noted below.

## Locked decisions (from the grill)
1. **Un-cut Journal + Learning this release** — reverses part of the PRD v16 ruthless cut.
   Recorded as **[ADR-0026](../docs/adr/0026-restore-journal-and-learning-uncut-r1.md)**.
   Audio, multi-family, Asia **stay cut**.
2. **Everything together** — one combined effort, dependency-ordered.
3. **Placeholder art now** — generation must yield a viewable book **without** a trained
   likeness; real training (the FormDataPart fix) is wired in parallel, not a loop dependency.

## Root causes found (grounded, for the maker)
- **Story gen fails:** `POST /api/storybooks` → 201 after ~51s but book lands `failed` /
  "No pages yet". Keys present; `claude-sonnet-4-6` returns HTTP 200 (verified live), so it's
  a **runtime throw in the text→page pipeline**, not config. Likely spots:
  `src/adapters/anthropic.ts:143` (response parse) and `src/services/storybook.ts:515`
  (`personas[0]!` throws when the Brief is Character-only / persona-free). **Diagnose before
  fixing** (issue 162).
- **Photo upload fails:** "Unsupported FormDataPart implementation" from
  `mobile/lib/form-data.ts:8` — RN `{uri,name,type}`-as-`Blob` rejected by Expo SDK 56 /
  RN 0.85 (issue 163). Read the versioned Expo v56 docs (`mobile/AGENTS.md`).
- **Learning / Journal:** deliberate R1 cuts, flag-gated (`mobile/lib/r1-flags.ts`) — un-cut
  per ADR-0026 (issues 164, 165).

## Invariants (in the PRD; each issue restates the ones it touches)
- **I1** latency: text pass p95 < 25s, book < 90s (watchdog ceiling); Journal paint < 300ms;
  upload ≤10 imgs streamed.
- **I2** failure: text throw → terminal `failed` + retry (never hang); **no-persona/fal-fail
  → placeholder-art `draft`, never failed-with-zero-pages**; upload fail → no partial Persona;
  Journal fail → empty/retry, and **gen succeeds with zero Moments**.
- **I3** security: placeholder art renders no raw photo / trains no likeness; un-cut flips
  server + mobile mirror together; Journal rides existing consent, solo one-Baby.

## Artifacts
- ADR: `CONTEXT/docs/adr/0026-restore-journal-and-learning-uncut-r1.md`
- PRD: `CONTEXT/planning/prd-v19-working-core-loop.md`
- CONTEXT glossary: added v19 language (Placeholder art, Partial un-cut)
- Issues: `CONTEXT/issues/162`–`167`

## Slice order (dependency-ordered)
| # | Issue | Blocked by |
|---|---|---|
| 162 | Story gen → viewable placeholder-art draft (**headline**) | — |
| 163 | Mobile photo-training upload (FormDataPart) fix | — |
| 164 | Restore Learning story type | 162 |
| 165 | Restore Journal (solo, one Baby) | 162 |
| 166 | Iconography + Back-button polish | — |
| 167 | Billing plan-toggle slider balance | — |

## Next agent starts at **issue 162** (`/part2`).
162 and 163 are both unblocked and independent; 162 is the headline (core promise). 164/165
depend on 162's pipeline. 166/167 are independent polish.

## Environment notes (not committed with app code)
- Dev repair made this session: `mobile/.env` `EXPO_PUBLIC_API_URL` repointed from a stale
  hotspot IP (`172.20.10.2`) to `127.0.0.1:3001` (Simulator-reachable). Backend runs via
  `npm run dev:paid` (port 3001, force-subscription). Metro via `npm start` in `mobile/`.
- Pre-existing uncommitted churn (`next-env.d.ts`, `tsconfig.json`) predates this session —
  left untouched; **not** part of the planning commit.
