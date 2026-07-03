# Session Handoff — /part3 review pass over the R1 mobile polish

> Date: 2026-07-03. Type: `/part3` code-review chain (ensure agent → four-net audit →
> fix → fresh-eyes grade → handoff → push) over `mobile/`. Branch:
> `feat/prd-v15-v16-v17-136-155`, on top of polish commit `1f6d514`. Presentation-only
> mandate unchanged — no domain/business logic, no web code, no re-added R1-cut features.

## What this session did

Two things, in order:

1. **Brought the dev stack up** so the R1 polish is viewable live in the iOS Simulator
   (see "Dev server" below). This is a running-state note, not a code change.
2. **Ran `/part3`** — a fresh review-and-fix pass on the already-PR'd polish diff
   (`8599a1f..HEAD`). This did **not** re-do the polish; it audited it with fresh eyes
   and closed the gaps that pass had left.

## /part3 outcome

- **Reviewer agent created** (was missing): `.claude/agents/part3-lullabook.md` — the
  personalized, committable maker for `mobile/`. Pins: scope `mobile/**`, gate
  `npm run verify` + `npx eslint mobile`, and the R1 invariant/design docs as attack
  targets. Idempotent — reuse it verbatim next `/part3`, don't regenerate.
- **Four-net audit** (maker report + audit log in the session scratchpad
  `part3-audit-log.md`):
  - (a) failing tests — **none**.
  - (b) static errors — **none new** (only the 2 known `mobile/metro.config.js`
    `require()` eslint errors; app source 0).
  - (c) invariant violations — **none**. Verified in code (not grep): the only two
    `<Image>` render sites in all of `mobile/` are `roster-avatar.tsx:53` (`avatarUrl`
    → generated `/api/avatars`) and `stories/[id].tsx:62` (`illustrationSource` →
    generated `/api/images`); `family/new.tsx` is upload-only and never renders the
    picked photo. R1-cut features still inert (story-types bedtime-only, audio/invite/
    Firsts gated; 149 passes). Page-turn is `SlideInRight.duration(90)`, no
    `.springify()`. No fabricated prices/dates; hard-delete reachable + wired.
  - (d) weak/uncovered tests — **2 real gaps, both fixed** (see below).
- **The one code change:** `tests/156-mobile-render-invariants.test.ts` (new, 4 tests,
  149-style source guards). It regression-guards the two R1 render-layer invariants that
  had passed the polish loop but had **no test**:
  - **D1** — reader page-turn ≤100ms: asserts `PageTurn` uses no `.springify()` (which
    ignores `.duration()` and settles ~400ms — the exact bug the polish fixed) and every
    `.duration(N)` ≤100.
  - **D2** — no raw uploaded child photo is ever rendered: asserts every mobile `<Image>`
    source derives only from the sanctioned generated helpers, and no source feeds a
    raw-photo/upload URI into an Image.
  The maker proved both guards non-tautological by mutating the source (re-adding
  `.springify()` and a raw-photo `<Image>`) and confirming the tests fail, then
  reverting.

## Two runtime crashes fixed while running the app (found by running, not the audit)

Running the app on the Simulator + expo-web surfaced two hard crashes the static
audit and unit suite couldn't see (both are UI-runtime failures with no node-testable
surface). Both fixed test-first with source guards, and graded PASS by a second
fresh-eyes checker.

1. **iOS: Expo Go SIGABRT on every screen** — `usePressFeedback`
   (`mobile/lib/use-press-feedback.ts`) called `disableSpringForReducedMotion(...)`, a
   plain JS function from `./haptics`, **inside the `useAnimatedStyle` worklet**. A
   worklet runs on Reanimated's UI thread; calling a non-worklet function there aborts
   the process (confirmed from the `.ips` crash report: `worklets::scheduleOnUI` →
   Hermes `throwPendingError` → `terminate` → SIGABRT). Because the hook backs every
   button/chip, the whole app crashed a frame after render. Fix: choose the spring
   config on the JS thread (`const { damping, stiffness } = PRESS_SPRING`) so the
   worklet closes over only primitives; reduce-motion now correctly uses
   `withTiming(scale, {duration:0})` instead of feeding a timing spec into `withSpring`.
   Guard: **`tests/157-mobile-worklet-safety.test.ts`** (no worklet body calls a
   `./haptics`-imported JS function; mutation-verified).
2. **Web: `ExpoSecureStore.default.getValueWithKeyAsync is not a function`** on
   baby-persona photo upload — `mobile/lib/supabase.ts` wired `expo-secure-store` as the
   Supabase auth-storage adapter, but expo-secure-store has **no web implementation**,
   so any session read on expo-web threw. Fix: new **`mobile/lib/auth-storage.ts`** with
   `selectAuthStorage(os)` → localStorage on web, encrypted SecureStore keychain on iOS
   (the shipping path is unchanged). Guard:
   **`tests/158-mobile-auth-storage-web.test.ts`** (web path uses localStorage, never
   SecureStore; native still uses SecureStore; supabase wires the selector;
   mutation-verified).

Note: web (expo-web) is a **dev-preview target only** — R1 ships iOS. These fixes make
the preview usable without changing the shipping path.

## Fresh-eyes checker grade (maker ≠ checker): **PASS**

A separate sub-agent graded the diff blind. Verdict PASS: test-only change, green for the
right reason, guards fail safe on the exact regressions they target, whole-tree grep
found no unguarded likeness-render path (`no ImageBackground` / `expo-image` /
`Image.getSize` / `backgroundImage`; `Avatar` renders initials only). Full suite **545
tests green**. It raised **two optional hardenings — explicitly not defects** — now
follow-ups #5–6 below.

## Gates at handoff

- `npm run verify` → **PASS, VERIFY-EXIT:0** (root+mobile typecheck, full vitest incl.
  156, Sentry check, 149 sweep, 153 seed; Playwright SKIP — no dev server).
- `npx eslint mobile` → app source **0 errors** (2 pre-existing `metro.config.js`
  `require()` errors, out of scope).

## Dev server (for viewing the UI live)

- Backend: `npm run dev:paid` → port **3001** (force subscription active, demo seed, fal
  fallback, liveness bypass). `mobile/.env` `EXPO_PUBLIC_API_URL` already points at
  `http://127.0.0.1:3001`.
- Expo: from `mobile/`, `npm run start` (default host — do **not** use `--host localhost`,
  it binds IPv6-only; see the standing memory), then
  `xcrun simctl openurl booted "exp://127.0.0.1:8081"` or tap **Expo Go** in the sim.
- Confirmed rendering on the iPhone 17 simulator: Maya's World cream home, skeleton
  loaders, emoji tab bar, `/api/home` 200 from the paid backend.

## Known follow-ups (flagged, not built — none is a reachable broken surface)

1. **Mobile PDF-export affordance** missing — server route exists
   (`src/app/api/storybooks/[id]/export`); the reader has no finalize/export. Completes
   the R1 "keeps it as a PDF" promise. **Next agent should start here.**
2. **Paywall CTA doesn't purchase** — `billing.tsx` CTA `router.dismiss()`; RevenueCat
   IAP unwired. Inert, not broken.
3. **Repo-root lint debt + `tests/* 2.*` macOS dupes** — still at repo root; blanket
   deletion declined by policy. Needs a dedicated dupe-sweep + lint-debt issue.
4. **Candidate "🎨 Look N" chips** — no real thumbnails; wire format unverified. Inert
   placeholder.
5. **(new) `tests/156` D2 allowlist is name-based** — it sanctions the JSX literal
   `source={source}`; a *future* file naming a var `source` and feeding it a raw URI
   would pass. Today the only such site (`stories/[id].tsx`) is correctly derived from
   `illustrationSource`. To close: assert derivation at the `source` definition site
   instead of sanctioning the JSX literal.
6. **(new) `tests/156` D1 extraction assumes the `entering` config stays inline in
   `PageTurn`** — factoring it to a module-level const would move a hypothetical
   `.springify()` outside the captured slice. Contrived; a whole-file scan for
   `springify` on any `SlideIn*`/`FadeIn*` used by `PageTurn` would be stricter.
7. **(new) Apple Sign-In has no web implementation** — `mobile/app/sign-in.tsx` and
   `sign-up.tsx` import `expo-apple-authentication`, which (like expo-secure-store) is
   native-only. It didn't block the reported upload flow, but it's the next-most-likely
   crash on the expo-web preview. If web preview matters, gate the Apple button behind
   `Platform.OS !== "web"` (same shape as the auth-storage fix). Not fixed this session.

## Suggested skills for the next session

- **`/part2`** — to build follow-up #1 (mobile PDF export/finalize) test-first: it's the
  lowest-numbered real feature gap and completes the R1 keepsake flow.
- **`/lullabook-design` + `/lullabook-design-check`** — for any new export/finalize UI, to
  keep it on Maya's World canon and lint it.
- **`/part3`** — reuse the now-existing `part3-lullabook` agent for the next review pass;
  optionally close hardenings #5–6 as its first framed bugs.

## Reference

- Prior handoff (the polish pass this reviewed):
  `CONTEXT/handoffs/SESSION-HANDOFF-2026-07-03-r1-mobile-polish.md`
- PR: https://github.com/VrajGupta/Lullabook/pull/106
- Audit log (session scratchpad): `part3-audit-log.md`
