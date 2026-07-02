# Session Handoff — /part2: PRD v15 (UI polish) + PRD v16 (R1 cut) + PRD v17 (observability)

> Date: 2026-07-02. Type: `/part2` implementation chain (issues 136–155, 20 issues).
> Branch: `feat/prd-v15-v16-v17-136-155`. Base: `8224bd7` (main). 20 commits, 541 tests pass.

## What this session produced

Three PRDs implemented end-to-end in one pass — **20 issues (136–155)**, each
shipped with a runnable Verification-command and committed separately:

- **PRD v15 — UI native polish (136–144):** the mobile app went from a "faithful
  web port" to Apple-grade native craft on top of the warm Maya's World brand.
  Touch feedback + haptics, gradient + glow buttons, pull-to-refresh, skeleton
  loaders + illustrated empty states, blurred translucent tab bar, native large
  titles in Baloo 2, FlatList/SectionList recycling, reanimated motion system
  (entrance + animated page-turn + twinkle/float hero), keyboard handling +
  animated controls + accessibility pass.

- **PRD v16 — Ruthless R1 cut (145–149):** audio, multi-family, Asia, and the
  heavy Journal machinery are cut from R1 — each enforced as a **server-side
  gate with no reachable UI** (inert, not broken). Solo Guardian, one baby, US-
  only, solo plan, Daily Notes kept. The dead-surface sweep (149) is the wave's
  acceptance gate: a regression guard that fails loudly if any deferred feature
  becomes reachable again.

- **PRD v17 — Test framework + observability (150–155):** Sentry wired into both
  the Next.js API and the Expo app with COPPA-grade PII scrubbing (tested, fail-
  open). Error→GitHub issue automation path verified. Deterministic seed fixture
  (one command → known-good world). Single `npm run verify` gate (exits non-zero
  on any real failure). Maestro mobile e2e flow authored.

## Verify gate (the done-condition)

```bash
npm run verify
```
```
✓ Typecheck (root)
✓ Typecheck (mobile)
✓ Unit + integration (Vitest) — 541 tests
✓ Sentry issue automation check
✓ Dead-surface sweep (149)
✓ Deterministic seed (153)
— Web e2e (Playwright) — SKIP (no server)
PASS — the app is healthy.
```

## Red-team findings (and what was fixed)

A fresh-eyes subagent attacked the full diff. Found **4 critical issues**, all
fixed in commit `f6b23ff` before handoff:

1. **C1 — Sentry scrubber missed exception/message payloads.** `beforeSendScrub`
   only scrubbed `request`/`extra`/`breadcrumbs` — not `event.exception.values[]
   .value` or `event.message` (the primary payload that auto-opens a GitHub
   issue). Fix: added `scrubString()` that strips emails, child/biometric URLs,
   and base64 blobs from exception values + messages. Mirrored on mobile.

2. **C2 — Nested PII leaked under PII parent keys.** `scrubObject` recursed into
   objects without checking the parent key — so `{persona:{name:"Maya"}}` leaked
   the baby name. Fix: when a key matches a PII pattern, the ENTIRE subtree is
   redacted. Added `name`/`displayname`/`nickname`/`dob` to `SCRUB_KEYS`.

3. **C3 — Settings page invite form was still live.** The 149 sweep missed
   `settings/index.tsx`, which still rendered a "Send invite" button calling the
   cut `/api/family/invite` (→ 404 → opaque error). Fix: gated behind
   `isR1MultiFamilyEnabled()`. The 149 sweep now scans settings + asserts the
   button is inside the gate.

4. **C4 — Settings page marketed cut voice features.** The "Real voices" perk +
   "hear their voices" copy sold audio that issue 145 cut. Fix: gated behind
   `isR1AudioEnabled()`; copy updated.

**Edges noted (not fixed — safe direction):** R1 flags use strict `=== "true"`
(trailing whitespace silently stays cut — safe); ` 2.tsx` duplicate files exist
on disk (gitignored, untracked, but Metro could surface them locally — worth
deleting in a cleanup pass).

## Issue ledger (all 20)

| # | Track | Commit | Gate |
|---|-------|--------|------|
| 136 | UI-A | `23abaa9` | 7 tests + mobile tsc |
| 137 | UI-A | `0ad3050` | mobile tsc |
| 138 | UI-A | `5cef24b` | mobile tsc |
| 139 | UI-A | `40db435` | mobile tsc |
| 140 | UI-B | `da883b6` | mobile tsc |
| 141 | UI-B | `2196a18` | mobile tsc |
| 142 | UI-B | `0ccd2ed` | mobile tsc |
| 143 | UI-C | `3f11bc8` | mobile tsc |
| 144 | UI-C | `b2ebdb3` | mobile tsc |
| 145 | v16-S1 | `d238b94` | 6 tests + mobile tsc |
| 146 | v16-S2 | `c3e0d3e` | 8 tests + mobile tsc |
| 147 | v16-S3 | `7f6b102` | 11 tests |
| 148 | v16-S4 | `e841728` | 5 tests + mobile tsc |
| 149 | v16-S5 | `f8c565a` | 16 tests |
| 150 | v17-T1 | `9067d3e` | 16 tests + root tsc |
| 151 | v17-T2 | `0008050` | 5 tests + mobile tsc |
| 152 | v17-T3 | `0008050` | check-sentry-issue-automation.mjs |
| 153 | v17-T4 | `f250a57` | 6 tests |
| 154 | v17-T5 | `f5c8d64` | 4 tests + `npm run verify` |
| 155 | v17-T6 | `f5c8d64` | Maestro flow authored |

## Honest follow-ups / gaps

- **Sentry account is a one-time human step:** create the org in the EU region
  (Frankfurt — can't move later), grab the DSN, set `SENTRY_DSN` env var. Configure
  the GitHub integration's **Issue Link settings** or alert-triggered issue
  creation silently no-ops (issue 152 flags this). `SENTRY_AUTH_TOKEN` (source
  map upload) is an EAS secret, not in the bundle.
- **Maestro e2e (155) is authored but not run** — needs a running iOS Simulator
  + dev backend + `brew install maestro`. The flow is at
  `mobile/.maestro/r1-core-loop.yaml`. Folded into `verify` as optional/tagged.
- **Playwright e2e skipped** in the verify gate (no running dev server during
  this session). It's an optional stage — doesn't block the fast suite.
- **iOS Simulator was started** (iPhone 17 booted, Expo app bundling) but the
  dev backend timed out before a full end-to-end tap-through. The `npm run verify`
  gate (541 tests + typecheck + sweep) is the done-condition that passed.
- **` 2.tsx` duplicate files** on disk (macOS-generated) are gitignored but
  worth deleting in a cleanup pass to avoid Metro route ambiguity.
- **Swipe-to-delete on FlatLists (142)** deferred — no delete API wired in
  mobile yet (would be a dead action).

## Invariants held (the /part1 contract)

- **Inert, not broken:** every cut feature is gated server-side (clean 404 before
  auth, never 500) with no reachable UI. The 149 sweep asserts this.
- **Cutting multi-family closes authz:** `requireCanCreate` blocks non-Guardians
  even on the plus plan when multi-family is cut. One-baby-per-Household enforced.
- **COPPA/GDPR line:** the Sentry scrubber never captures child photos, biometric/
  LoRA data, PII, consent/auth tokens, or secrets — tested exhaustively (16 scrub
  tests). `sendDefaultPii: false`; `attachScreenshot: false`; replay OFF. User set
  to opaque ID only.
- **Fail-open:** Sentry disabled/no-DSN/test → no-op; the app keeps working.
- **Verify gate exits non-zero on any real failure** — asserted by injecting a
  known failure (no green-washing).
- **No domain/behavior change in the UI wave** (136–144) — presentation only.
- **R2 paths preserved:** all cut code stays behind flags; R2-path tests opt back
  in via the flag. Nothing is deleted.

## Next agent starts at

R1 is feature-complete + verified. The next work is:
- **Human:** create the Sentry org (EU), set `SENTRY_DSN`, configure the GitHub
  integration Issue Link settings.
- **Human/agent:** run the Maestro e2e (155) against a live Simulator.
- **Agent:** cleanup pass — delete ` 2.tsx` duplicates, remove dead VoicePlayback
  code from the reader, wire swipe-to-delete when the delete API exists.
- **Agent:** ADR-0026 (flagged in the invariants doc) to formally record the cut
  + the Sentry decision.
