# Session handoff — 2026-07-06 — /debugger review of PRD v19 (issues 162–167)

## What this session did
Ran `/debugger` (loop-closer) over the PRD v19 implementation commit `188a49a` on branch
`feat/prd-v19-working-core-loop`. Reused the existing `debugger-lullabook` auditor agent
(not recreated). Maker ran the four-net audit + gate; a **separate fresh-eyes checker**
(different context — maker ≠ checker) reviewed the diff. **Review: CLEAN.** No code changes
were needed; this handoff is the only artifact this session added.

## Gate state (green)
- `npm run verify` → **VERIFY-EXIT:0** (root + mobile typecheck, Vitest, Sentry, 149
  dead-surface, 153 seed all PASS).
- Per-issue tests `tests/162..167` → **57/57 pass**.
- `npx eslint mobile` → 0 app errors (only 2 pre-existing `metro.config.js` `require()`
  errors, out of scope).

## Four-net audit result
- **Net 1 failing tests:** none.
- **Net 2 static/type/lint:** none new.
- **Net 3 invariant violations:** none. Verified by reading code, not grep:
  - **I2.2 (headline):** the old `personas[0]!` throw (`storybook.ts:515`) is gone —
    single/zero-persona branch guards `personas.length > 0 ? … : "lora/default"`; the
    multi-persona and reference-model branches were already persona-safe; recover/reroll
    route through the same guarded builder, so the throw cannot resurface. Character-only
    or fal-failure → text-viewable `draft`, never `failed`-with-zero-pages once text
    succeeded. Real integration tests cover it.
  - **I2.1:** text throw/empty → terminal `failed` + retry; watchdog reaps stranded
    `generating`. `anthropic.ts` now surfaces max_tokens / malformed-JSON as clear errors.
  - **I2.4:** journal flag on + **zero Moments** still generates (`selectForBaby`
    degrades, no throw); auto-context stays independently gated. Real gen test.
  - **I3.1:** placeholder path uses `lora/default`, no raw photo, no likeness, no consent
    gate for a Character-only book.
  - **I3.2:** the Journal is a genuinely reachable screen (`/daily`), capture + timeline
    render unconditionally; only the Firsts chip + server auto-context are flag-gated
    (matches ADR-0026). Not a dead card.
  - **167:** real fix at the source — `AnimatedToggle` in `maya-ui.tsx` got `flex:1` +
    `textAlign:center` so both segments are 50% and align with the sliding indicator;
    `billing.tsx` untouched by design. Not tautological.
- **Net 4 weak/missing tests:** every invariant has a real covering test; no test-first
  fix warranted (no reproducing failure). Weaknesses recorded as follow-ups.

## Checker's review: CLEAN — what it caught (nits, none blocking)
1. **Test 163 is source-grep only** — no behavioral XHR mock; the `status===0` deferral /
   `settled` guard / JSON-parse paths in `mobile/lib/api.ts` are regex-verified, not
   driven. I2.3 runtime behavior still owed a live-device pass.
2. **`mobile/lib/api.ts` has no `xhr.onabort`** — unreachable today (nothing calls
   `abort()`), so a nit, but a hang risk if abort is ever wired.
3. **167 wrap risk** — `toggleText` has no `numberOfLines={1}` and `allowFontScaling` is
   on (pre-existing); at max system font on the narrowest device the label can *wrap*
   (not clip — flex:1 fixed the clip). A `numberOfLines={1}` cap would harden it.
4. **`context-selector.ts:164` "Baby not found"** — pre-existing (not in this diff);
   throws if `brief.babyId` is a hard-deleted baby while the server journal flag is on.
   Unreachable via the zero-Moments path actually covered.

## Honest follow-ups (from maker + checker, for later)
- **Live-device pass still owed:** 162 structured-output vs a live API that ignores
  `output_config` (returns prose), 163 XHR runtime, and the actual on-device story
  generation. Local gate is green; live behavior unconfirmed.
- **EAS/CI env:** the two un-cut flags (`EXPO_PUBLIC_R1_STORY_TYPES_ENABLED`,
  `EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED`) live in gitignored `mobile/.env`; confirm
  the build pipeline injects them so Learning + Firsts/auto-context reach production.
- Optional hardening: 167 `numberOfLines={1}`; 166 hero `✨` label dedup; missing-baby +
  journal-flag edge test.
- **Repo hygiene:** untracked macOS `"* 2.*"` dupe files exist on disk (incl.
  `src/services/context-selector 2.ts`, many `tests/*.test 2.ts`) — not tracked, gate
  green with them present, but per project memory they can break expo-router at runtime.
  Sweep before the live-device run.

## Next thing to review
Live-device run of the core loop (story generation on the Simulator, Learning type in
Create, Journal open) — the one thing the local gate cannot prove.
