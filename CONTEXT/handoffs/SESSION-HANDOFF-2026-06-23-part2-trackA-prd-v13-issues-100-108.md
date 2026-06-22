# Session Handoff — 2026-06-23: /part2 Track A — PRD v13 "It actually works" (issues 100–108)

> Implementation session. Track A complete. All 9 issues shipped test-first,
> red-team clean, 367 tests pass, web + mobile tsc clean. **Next agent runs
> Track B (issues 109–115, ADR-0024 family accounts + voice).**

## What was built (Track A — issues 100–108)

### Issue 100 — Generation always reaches a terminal state (every adapter)
- Moved the "never strand in `generating`" backstop **into the service**
  (`StorybookService.runGenerationBody`) so it holds on every workflow adapter
  (Inngest, LocalDevWorkflowAdapter, FakeWorkflow), not just Inngest.
- Added `reapStrandedGenerations` watchdog (≤5min budget, configurable) that
  marks non-terminal books `failed`.
- Wired the watchdog into the reader poll (`GET /api/storybooks/[id]`).
- POST route catch + Inngest catch now always persist the terminal state.
- Tests: `tests/100-storybook-terminal.test.ts` (4 tests).

### Issue 101 — Reader surfaces failed/timed-out generation
- Mobile reader (`mobile/app/(tabs)/stories/[id].tsx`) now renders a clear
  **failed** state (not infinite spinner) with a retry affordance.
- Poll stops after a 5-min budget and shows a timed-out state with retry/back.
- Generate POST error already surfaced on the create screen (no dead navigation).

### Issue 102 — Text-viewable Storybook fallback
- Relaxed `finalizeStorybookStatus`: when illustrations are unavailable but text
  pages exist (≥ floor), the book degrades to a readable **text-viewable `draft`**
  instead of uniformly `failed`.
- Reader renders page text gracefully when `illustrationBlobKey` is null.
- Tests: `tests/102-storybook-text-fallback.test.ts` (2 tests).
- Updated 2 pre-existing tests (06, 16) that encoded the old "illustrations
  failed → book failed" contract.

### Issue 103 — Mobile nested stack-in-tab (kill the Redirect shims)
- Restructured 3 shim tabs into nested Stacks: `(tabs)/stories/`, `(tabs)/create/`,
  `(tabs)/settings/` — each with `_layout.tsx` + `index.tsx`.
- Moved `storybooks/index.tsx` → `(tabs)/stories/index.tsx`,
  `storybooks/[id].tsx` → `(tabs)/stories/[id].tsx`,
  `storybooks/new.tsx` → `(tabs)/create/index.tsx`,
  `account.tsx` → `(tabs)/settings/index.tsx`.
- Tab bar never unmounts; drill-downs keep the tab bar mounted; back stays inside.
- Updated all navigation links (`/storybooks` → `/stories`, `/storybooks/new` → `/create`, etc.).

### Issue 104 — Branded in-app back affordance
- Created `mobile/components/BackPill.tsx` — a Maya-UI pill-shaped back button,
  guarded by `router.canGoBack()` (returns null at stack root, no dead-end).
- Applied to all nested stack layouts and the root stack via `headerLeft`.

### Issue 105 — Billing as a reachable modal
- Registered `billing` with `presentation: "modal"` in root `_layout.tsx`.
- Removed orphaned `modal.tsx`.
- Wired upgrade CTAs in the account/settings screen to `router.push("/billing")`
  (no more dead `setNotice`).
- Billing modal has `router.dismiss()` on plan selection.

### Issue 106 — Daily-life as a first-class destination
- Promoted the Journal/daily-life entry on Home to a prominent full-width
  featured card (amber accent, above the dashboard grid).
- The Moment composer, Firsts filter, timeline, and inline "Make this a Story"
  offer still work over real data (unchanged `daily.tsx`).

### Issue 107 — Dev-only seed reachable from the app
- Created `src/app/api/dev/seed/route.ts` — Bearer-authed, double-gated
  (`NODE_ENV !== "production"` AND `DEV_DEMO_SEED === "true"`).
- Added `__DEV__` seed button on the mobile Family tab.
- Tests: `tests/107-dev-seed.test.ts` (3 tests — prod-inert, flag-inert, unauth).

### Issue 108 — Camera-free real-upload path for the Simulator
- Added `src/lib/dev-bypass.ts` with `shouldDevBypassLiveness()` and
  `shouldDevFalFallback()` — both double-gated, prod-inert.
- Wired `FakeLiveness` in `context.ts` when dev bypass is active.
- Created `src/adapters/dev-fal-fallback.ts` — placeholder training → `ready`
  with synthetic LoRA key, no live fal keys needed.
- Added `__DEV__` "pick selfie from library" branch in `mobile/app/family/new.tsx`.
- Tests: `tests/108-dev-persona-upload.test.ts` (6 tests).

## Pre-existing tsc fixes (unblocked every issue's gate)
- Fixed `src/domain/types.ts` + `story-type.ts` to use relative imports (mobile
  tsconfig couldn't resolve `@/domain/...`).
- Fixed stale `.next/types` duplicate files (from multiple `next dev` dist dirs).
- Fixed test files 23, 54, 61, 74, 77, 88, 95, 99 (type errors blocking tsc).
- Fixed `mobile/components/ExternalLink.tsx` typed-route issue.
- Cleaned `tsconfig.json` (removed duplicate `.next-*/types` include dirs).

## Red-team findings (all PASS)
1. **Generation terminal on every adapter** — PASS. `runGenerationBody` wraps the
   entire `runGenerationBodyInner` (claude pass + page pipelines + finalization)
   in try/catch. Any throw from any step → `markFailedIfGenerating`.
2. **Watchdog never downgrades terminal books** — PASS. `reapStrandedGenerations`
   skips anything not `generating` (line 257). Tests 100 confirm.
3. **Text-viewable fallback edge case** — PASS. A book with 0 text pages stays
   `failed`; a book with ≥ floor text pages reaches `draft`. Test 102 confirms
   both paths.
4. **Dev gates prod-inert** — PASS. All three gates check `NODE_ENV !==
   "production"` first. Tests 107, 108 confirm.
5. **POST persist catch** — PASS. Best-effort `try/catch` around `ctx.persist()`
   never masks the original error. Book is terminal in-memory regardless.
6. **Billing modal dismiss** — PASS. `router.dismiss()` on plan selection.
7. **BackPill canGoBack** — PASS. Returns `null` when false (no crash).
8. **Mobile nav dead links** — PASS. All `/storybooks/...` and `/account` nav
   refs updated. Remaining `/api/storybooks` and `/api/account` are API paths
   (unchanged), not navigation.

## Test state
- **Web:** 75 test files, 367 tests, all passing.
- **Web tsc:** clean (0 errors).
- **Mobile tsc:** clean (0 errors).
- **Duplicate files:** none (`find . -name '* 2.*'` → empty).

## Honest follow-ups / known limitations
- The `DevFalFallbackAdapter` returns placeholder images (not real faces) —
  sufficient for the Simulator to reach `ready` but illustrations won't look
  like the uploaded person. This is by design (dev-only, synthetic faces).
- The watchdog budget (5 min) is a constant; a future issue could make it
  configurable per StoryType (short books need less).
- The billing modal still shows the old 3-tier pricing (Basic/Normal/Plus) —
  this will be replaced by the 2-plan model in Track C (issue 120).

## Next agent starts at: issue 109
Run `/part2` Track B (issues 109–115, ADR-0024 family accounts + voice).
Build order: 109 (invite token model + email) → 110 (invite acceptance +
self-persona link) → 111 (mobile invite/accept UI) → 112 (voice API route) →
113 (mobile family-detail voice recorder) → 114 (reader voice playback) →
115 (voice message immediate post + notify).

## Artifacts
- New test files: `tests/100-storybook-terminal.test.ts`,
  `tests/102-storybook-text-fallback.test.ts`, `tests/107-dev-seed.test.ts`,
  `tests/108-dev-persona-upload.test.ts`.
- New source: `src/lib/dev-bypass.ts`, `src/adapters/dev-fal-fallback.ts`,
  `src/app/api/dev/seed/route.ts`, `mobile/components/BackPill.tsx`,
  3 nested `_layout.tsx` files.
- Modified: `src/services/storybook.ts`, `src/workflows/functions.ts`,
  `src/app/api/storybooks/route.ts`, `src/app/api/storybooks/[id]/route.ts`,
  `src/lib/context.ts`, `mobile/app/_layout.tsx`, mobile nav restructure.

## Gotchas (carry forward)
- macOS `* 2.*` duplicate files break expo-router — verification commands guard.
- Metro binds IPv6 only; run `npm run proxy:8081` and re-open with
  `xcrun simctl openurl booted "exp://127.0.0.1:8081"`.
- Use free-use/synthetic faces, not real celebrities, for the dev seed.
