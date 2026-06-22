# Implementation prompt for GLM 5.2 — Lullabook PRD v13

You are implementing **PRD v13** for Lullabook (a Next.js web backend in `src/` + an Expo
React Native iOS app in `mobile/`). Planning is done; your job is to build it, test-first,
in dependency order, as three PRs. **Do not re-plan or re-grill** — the decisions are
locked in the docs below.

## 1. Read this context FIRST (in order)
1. `CONTEXT/CONTEXT.md` — the domain glossary. Read the **v13 section** at the bottom
   (Just Us / Our Whole Family, Invited Member, Member-login cap, Create-rights, Voice
   message, Generation terminal state) plus Household/Member/Guardian/Persona/Storybook.
2. `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md` — the PRD: the three
   tracks, the locked decisions, and the **Invariants** (your PASS/FAIL contract).
3. `CONTEXT/docs/adr/0024-family-accounts-collaborative-creation.md` — family accounts /
   invitations (extends ADR-0006; realizes the case ADR-0014 deferred).
4. `CONTEXT/docs/adr/0025-two-plan-monetization.md` — two-plan pricing (supersedes
   ADR-0023). Household is the billing subject; entitlement is server-authoritative.
5. `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-22-part1-prd-v13-family-accounts.md` — the
   session handoff: what was decided and why, the build order, and the start issue.
6. `CONTEXT/issues/100` … `121` — your work items. Each has What-to-build /
   Acceptance-criteria / **Verification-command** / Blocked-by.
7. `CONTEXT/local-dev/RUN-LOCAL.md` and `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` — how to
   run web + the iOS Simulator. `mobile/AGENTS.md` — Expo SDK 56 has changed; consult
   https://docs.expo.dev/versions/v56.0.0/ before writing expo-router code.

## 2. Skills to use
- **`/part2`** — your main loop. It picks the lowest-numbered open issue whose Blocked-by
  chain is satisfied, builds it test-first (`tdd`), runs a **red-team pass** against the
  PRD invariants, then writes + pushes a handoff. Run it repeatedly, one issue at a time.
- **`tdd`** — red→green→refactor for every issue. The issue's `Verification-command` is the
  done-condition; it must exit 0.
- **`lullabook-design`** + **`lullabook-design-check`** — for every UI issue (Track A nav,
  Track B mobile screens, Track C paywall). Build on the Maya's World tokens, then run the
  design-check linter; UI issues are not done until they pass it.
- **`xcode-ios-dev`** — to run the app in the iOS Simulator and visually verify mobile work.
  Note the gotchas: remove any `* 2.*` dupe files (they break expo-router), and run
  `npm run proxy:8081` then `xcrun simctl openurl booted "exp://127.0.0.1:8081"` (Metro
  binds IPv6 only). Backend: `npm run dev:paid` (:3001); app: `npm run ios:paid`.
- **`live-app-audit`** / **`verify`** — after each PR, exercise the feature end-to-end on
  both plans and confirm it actually works (not just green tests).
- **`code-review`** — before pushing each PR.

## 3. Build order — three PRs, A → B → C
- **PR 1 — "It actually works" (Track A):** issues **100–108**. Start at **issue 100**
  (generation terminal-state — the highest-impact fix). This unblocks a usable, testable app.
- **PR 2 — "The whole family" (Track B):** issues **109–115** (ADR-0024) — invitations +
  voice.
- **PR 3 — "Pricing" (Track C):** issues **116–121** (ADR-0025) — two plans, caps, ledger,
  paywall.
Respect each issue's `Blocked-by`. 116 depends on 110; 117/118 depend on 116; 120 on
105+116; 121 on 116+110.

## 4. Non-negotiable invariants (red-team every issue against these)
- Generation **always** reaches a terminal state (`draft`|`failed`) on **every** workflow
  adapter; bounded watchdog; the reader **never** spins on "Illustrating" forever; degrade
  to a text-viewable draft when illustration is unavailable.
- The mobile tab bar **never unmounts** on a tab press; **every** pushed screen has an
  in-app back affordance (not the bare native chevron).
- Entitlement, plan, login-cap, and **create-rights are server-authoritative** (the 403 is
  the boundary; client UI is UX only). **All dev-only paths (seed, liveness bypass,
  `DEV_FORCE_SUBSCRIPTION`) are double-gated (`NODE_ENV !== "production"` AND an explicit
  flag) and inert in production** — write a test that asserts no effect in production.
- Cross-member RLS isolation; Guardian-only invite/remove/baby-persona/hard-delete; an
  invited Member never gains Guardian powers; invite tokens are single-use + expiring.
- Apple IAP entitlement is **Household-level** (inherited on login), never per-seat;
  Email-Plus VPC still gates Baby Persona on iOS.
- Cap/credit exhaustion is never a dead end; a failed metered action refunds; idempotent.
- Use **free-use / synthetic faces, not real celebrities**, for the camera-free dev seed.

## 5. Definition of done (per issue / per PR)
- The issue's `Verification-command` exits 0 (tests + `tsc --noEmit`; mobile issues also
  `cd mobile && npx tsc --noEmit` and the dupe-file guard).
- The red-team pass found no invariant violation (or you fixed what it found).
- UI issues pass `lullabook-design-check`.
- You ran the relevant flow live (Simulator / `verify`) and it works on both plans.
- Then `code-review`, commit, push the PR, and write a session handoff.
