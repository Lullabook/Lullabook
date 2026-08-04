# Session Handoff — /coder PRD v19 issues 162–167 (working core loop)

> Date: 2026-07-06. Type: `/coder` implementation chain (build → red-team → handoff → push)
> over issues 162–167 from PRD v19 "Working core loop" (ADR-0026).
> Branch `feat/prd-v19-working-core-loop`. This is the build pass that closes the founder's
> one-shot `/planner → /coder` run for PRD v19 — six issues built test-first, red-teamed,
> and pushed.

## What was built

Six issues, dependency-ordered (162 is the headline; 164/165 depend on 162's pipeline):

### 162 — Story generation → viewable placeholder-art draft (headline)
**Root cause fixed:** `personas[0]!.loraWeightKey` at `src/services/storybook.ts:515` threw
`TypeError` when `personas` was empty (Character-only / persona-free Brief). The throw was
caught by the fal-gen step's try/catch, so pages landed `failed` for the image (not
placeholder art). Separately, `parseGeneratedStory` at `src/adapters/anthropic.ts:143`
threw an opaque `SyntaxError` on truncated JSON (max_tokens) — producing zero-page
`failed` books.

**Fix:**
- `src/services/storybook.ts:515` — `personas.length > 0` guard before `personas[0]!`;
  when empty, uses `"lora/default"` (placeholder art: generic illustration, no raw photo,
  no likeness — I3.1). fal is now called (not skipped by a throw).
- `src/adapters/anthropic.ts:136-160` — `max_tokens` stop_reason detected before
  `JSON.parse` (clear diagnostic, not opaque SyntaxError). `JSON.parse` wrapped in
  try/catch with a "malformed JSON" error. Existing text-viewable fallback (issue 102)
  still degrades text-success to `draft`.

**Tests:** `tests/162-story-generation-placeholder-draft.test.ts` — 13 tests (Character-only
→ draft, placeholder art calls fal with lora/default, fal-fail → text-viewable draft,
text-throw → failed, watchdog reaps, parser robustness: max_tokens, malformed JSON, empty
content, refusal).

### 163 — Mobile photo-training upload (FormDataPart) fix
**Root cause fixed:** Expo SDK 56's "winter" fetch polyfill
(`expo/src/winter/fetch/convertFormData.ts:77`) throws "Unsupported FormDataPart
implementation" on RN's native `{uri, name, type}` FormData file parts — it only handles
strings, Blobs, and objects with a `bytes()` method.

**Fix:** `mobile/lib/api.ts` — `apiFormData` rewritten to use `XMLHttpRequest` directly
(the RN-blessed streaming path). RN's XHR serializes `{uri}` parts from disk natively
(no base64 in memory — I1.3). `settled` flag prevents double-resolve. `status === 0`
defers to `onerror` for the helpful network-error message (red-team EDGE-1 fix).

**Tests:** `tests/163-mobile-formdata-upload.test.ts` — 10 source-level tests (XHR not
fetch, FormData sent as-is, bearer token attached, failure/timeout/network error handling,
status===0 defers to onerror, form-data helpers build RN parts not base64).

### 164 — Restore the Learning story type (un-cut)
**Fix:** `mobile/app/(tabs)/create/index.tsx` — Learning icon `🌟` → `🎓` (role-correct,
distinct from Bedtime `🌙`). `mobile/.env` + `.env.example` —
`EXPO_PUBLIC_R1_STORY_TYPES_ENABLED=true`. Server side has no counterpart gate (confirmed
by test: a `learning` Brief generates without rejection).

**Tests:** `tests/164-learning-story-type.test.ts` — 5 tests (learning generates draft,
FakeAnthropic receives learning storyType, flag on/off, Create screen source has 🎓 not 🌟).

### 165 — Restore the Journal (solo, one Baby) — un-cut
**Fix:** `mobile/.env` + `.env.example` — `EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED=true`.
The World home Journal card and Daily screen capture form were already reachable (not
behind the flag). The flag only gates the Firsts filter chip and auto-context injection.

**Critical I2.4 invariant proven:** `tests/165-journal-restore.test.ts` — 7 tests. A book
with zero Moments generates `draft` (no hard dependency). Auto-context injection is
independently gated (off → no momentContext; on → Moment body reaches prompt).

### 166 — Iconography + Back button polish
**Fix:**
- `mobile/components/BackPill.tsx` — plum-tinted shadow added (`shadowColor: "#3A2850"`,
  `shadowOpacity: 0.08`, `shadowRadius: 12`, `elevation: 2`).
- `mobile/app/(tabs)/index.tsx` — Continue-reading card `📖` → `🌙` (was duplicate with
  Journal hero). What-happened-today card `✨` → `✍️` (was duplicate with Create tab).

**Tests:** `tests/166-iconography-back-button.test.ts` — 15 tests (BackPill uses canon
tokens + shadow, no ad-hoc ‹ Back, tab bar 5 distinct emoji, dashboard no duplicate
glyphs, Learning uses 🎓 not 🌟).

### 167 — Billing plan-toggle slider balance
**Fix:** `mobile/components/maya-ui.tsx` — `toggleBtn` gets `flex: 1` (equal-width
segments, no clipping of "Annual (save 17%)"). `toggleText` gets `textAlign: "center"`.

**Tests:** `tests/167-billing-toggle-balance.test.ts` — 7 tests (flex:1, textAlign
center, numberOfLines/allowFontScaling, AnimatedToggle used, labels present, canon tokens,
indicator sized to segment).

## Red-team pass (fresh-eyes subagent — maker ≠ checker)

**Result: PASS — no real bugs found.** One EDGE case fixed test-first:

- **EDGE-1 (fixed):** `apiFormData` — XHR spec fires `onreadystatechange(readyState=4,
  status=0)` BEFORE `onerror` on network failures. The `settled` guard would swallow the
  helpful "Network error" message, leaving "Upload failed (0)". Fixed: `status === 0`
  returns early from `onreadystatechange`, deferring to `onerror`. Test added.

**Noted, not fixed (honest follow-ups):**
- **NIT-2:** Server-side `R1_JOURNAL_MACHINERY_ENABLED` is NOT set in `.env.local`
  (gitignored). Mobile flag is on, server flag isn't — auto-context injection won't run in
  local dev until the founder adds `R1_JOURNAL_MACHINERY_ENABLED=true` to `.env.local`.
  Tests stub the env var, so the verify gate is green. This is a local-dev config gap,
  not a code bug.
- **NIT-3:** `BackPill` adds `elevation: 2` (Android shadow) but `Card` in `maya-ui.tsx`
  doesn't — minor Android visual inconsistency. Pre-existing (Card was already missing
  `elevation`).
- **EDGE-2:** `max_tokens` check throws before attempting parse — theoretically a valid
  JSON landing exactly at the token limit would be rejected. Vanishingly rare; the
  diagnostic is clear. Acceptable trade-off.
- **EDGE-3:** No `AbortController` on `apiFormData` XHR (user navigates away mid-upload →
  XHR continues to 120s timeout). Not a regression — old `fetch` impl also took no `signal`.

## Gate state (all green)

```
npm run verify:
  ✓ Typecheck (root): PASS
  ✓ Typecheck (mobile): PASS
  ✓ Unit + integration (Vitest): PASS
  ✓ Sentry issue automation check: PASS
  ✓ Dead-surface sweep (149): PASS
  ✓ Deterministic seed (153): PASS
  — Web e2e (Playwright): SKIP (no server)
```

New test files: `tests/162-*.test.ts` (13), `tests/163-*.test.ts` (10), `tests/164-*.test.ts`
(5), `tests/165-*.test.ts` (7), `tests/166-*.test.ts` (15), `tests/167-*.test.ts` (7).
**57 new tests, all green.** Existing suite untouched and green.

`npx eslint mobile` — 0 errors (5 pre-existing warnings in maya-ui.tsx, all unchanged).

## What was NOT done (honest follow-ups)

1. **Live-device verification** — the core loop (upload → persona → generate → read →
   finalize → export) needs a physical iPhone / Simulator pass. The FormDataPart fix
   (163) and placeholder-art path (162) are verified at the unit/source level but not
   exercised end-to-end on hardware. This is the same follow-up from the prior /debugger
   handoff (Maestro flow unexercised).
2. **Server-side `R1_JOURNAL_MACHINERY_ENABLED`** in `.env.local` — see NIT-2 above.
3. **The `output_config` field** — the `parseGeneratedStory` robustness fix handles the
   symptoms (truncated JSON, malformed text) but the root cause of the live "zero pages"
   failure may be the `output_config.format.type = "json_schema"` field not being
   honored by the API (returning plain text instead of JSON). The try/catch now surfaces
   a clear "malformed JSON" error instead of an opaque SyntaxError, but if the API is
   ignoring `output_config`, the structured output won't work regardless. Needs a live
   API test to confirm.
4. **Pre-existing uncommitted churn** (`tsconfig.json`, `next-env.d.ts`) — reverted before
   commit; predates this session per the /planner handoff.

## Next session

- **Live-device sweep** on the physical iPhone / Simulator: full loop upload → persona →
  generate → read → finalize → export PDF. Verify the FormDataPart fix (163) actually
  uploads photos, the placeholder-art path (162) produces a readable book, and the
  Journal (165) + Learning (164) are reachable. Measure E1 p95 (text < 25s, book < 90s).
- Or `/debugger` review pass over this diff if the founder wants a second checker round
  before the live sweep.

## Reference

- PRD: `CONTEXT/planning/prd-v19-working-core-loop.md`
- ADR: `CONTEXT/docs/adr/0026-restore-journal-and-learning-uncut-r1.md`
- Issues: `CONTEXT/issues/162`–`167`
- Prior handoff: `SESSION-HANDOFF-2026-07-06-planner-prd-v19-working-core-loop.md`
