# Session Handoff — 2026-06-22: /part1 → PRD v13 (working app + family accounts + 2-plan pricing)

> Planning-only session (`/part1`). No app code written. Produced ADR-0024, ADR-0025,
> PRD v13, issues 100–121, and CONTEXT glossary updates. **Next agent (GLM 5.2) runs
> `/part2` starting at issue 100.** Branch `feat/wave-prd-v12-89-99` (carry forward or cut
> a fresh branch per track).

## How this started
Ran the v12 build live on the iOS Simulator (`npm run dev:paid` :3001 + `npm run ios:paid`
+ `npm run proxy:8081` for the IPv4 gotcha). Confirmed the 5-tab nav, baby-hero dashboard,
and paywall render — then the user reported a wave of problems that became this PRD.

## What was decided (the grill)
Six read-only code-tracing agents + two economics/market agents grounded every decision.

- **Generation never finishes** → the "never strand in `generating`" backstop exists only
  on the Inngest path, not the local-dev adapter. Fix: move it into the service + add a
  watchdog + a text-viewable fallback. (Track A)
- **Nav isn't real** → 3/5 tabs are `<Redirect>` shims that leave the tab navigator; no
  in-app back button anywhere. Fix: nested stack-in-tab + branded back + billing modal.
  (Track A)
- **Daily-life "missing"** → the Journal screen already exists and works; it's just buried.
  Fix: make it a first-class destination. (Track A)
- **Sim testing** → reference photos already use the library picker; the camera blocker is
  the adult consent selfie + Rekognition liveness + fal training. Fix: dev-only seed route
  + camera-free real-upload (library selfie + dev liveness bypass + training fallback), all
  double-gated. (Track A)
- **Family accounts (the big new thing)** → invite a grandparent by email → their own login
  → linked to their self-consented Adult Persona; they record voice + create stories. The
  invite primitive half-exists (`acceptInvite` is orphaned; no token/email; onboarding
  collision). This is the case **ADR-0014 deferred**. → **ADR-0024**. (Track B)
- **Voice** → the whole backend exists (service + lullaby-weave into the Prompt); no API
  route, no mobile UI. Fix: voice API + family-member detail recorder + reader playback.
  (Track B)
- **Monetization re-architecture** → collapse Basic/Normal/Plus into **two plans**:
  **Just Us** ($9.99/$79.99, one creator, no voice/video) and **Our Whole Family**
  ($24.99/$199.99, everyone creates, voice+video). Verified by unit economics ($0.49/story,
  illustrations ≈80%; voice ~free; video the costly unit) + market (BedtimeStory.ai $9.99,
  Calm/Headspace family $99.99/yr). Two new primitives: **member-login cap** +
  **per-member create gate**. Also fixes two real bugs: the Story cap is never enforced and
  the credit ledger is in-memory. → **ADR-0025 supersedes ADR-0023**. (Track C)

## Locked invariants (the PASS/FAIL contract — for /part2's red-team)
- Generation always reaches a terminal state on **every** adapter; bounded watchdog;
  reader never spins forever; text-viewable fallback when illustration is absent.
- Mobile tab bar never unmounts on a tab press; every pushed screen has an in-app back.
- Entitlement / plan / login-cap / **create-rights are server-authoritative**; all
  dev-only paths (seed, liveness bypass, `DEV_FORCE_SUBSCRIPTION`) are **double-gated and
  inert in production**.
- Cross-member RLS isolation; Guardian-only invite/remove/baby-persona/hard-delete; an
  invited Member never gains Guardian powers; invite tokens single-use + expiring.
- Apple IAP entitlement is **Household-level** (inherited on login), never per-seat;
  Email-Plus VPC still gates Baby Persona on iOS.
- Cap/credit exhaustion is never a dead end; a failed metered action refunds; idempotent.

## Artifacts
- ADRs: `CONTEXT/docs/adr/0024-family-accounts-collaborative-creation.md`,
  `CONTEXT/docs/adr/0025-two-plan-monetization.md`
- PRD: `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`
- Issues: `CONTEXT/issues/100…121` (each has a runnable `Verification-command`)
- Glossary: `CONTEXT/CONTEXT.md` (v13 section)

## Build order → 3 PRs
- **PR 1 — Track A (It actually works):** issues **100–108**. Start here.
- **PR 2 — Track B (The whole family):** issues **109–115** (ADR-0024).
- **PR 3 — Track C (Pricing):** issues **116–121** (ADR-0025).
Order **A → B → C** — 116 (entitlement) is Blocked-by 110 (member model); 117/118 by 116.

## Next agent starts at: issue 100
Run `/part2`: pick the lowest-numbered open issue whose Blocked-by chain is satisfied,
build it test-first, red-team against the invariants above, then handoff + push.

## Gotchas (carry forward)
- macOS `* 2.*` duplicate files break expo-router ("Unmatched Route") — the verification
  commands guard for them.
- Metro binds IPv6 only; run `npm run proxy:8081` and re-open with
  `xcrun simctl openurl booted "exp://127.0.0.1:8081"`.
- Use **free-use / synthetic faces, not real celebrities**, for the camera-free seed
  (publicity rights), even in dev.
