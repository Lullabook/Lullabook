# PRD v22 — Reachable app release readiness

> Planning result of the 2026-08-02 `/part1` run. This plan turns the founder's live report (“the app is laggy; Generate appears to do nothing; provider access and cost are unclear”) into one dependency-ordered release-readiness effort. It covers the currently reachable iOS app surfaces only. It does not invent deferred roadmap features.
>
> Parent map: [Wayfinder #133](https://github.com/Lullabook/Lullabook/issues/133). Implementation tickets are drafted in `plans/reachable-app-release-readiness/TICKETS.md` and are published only after this entire plan is reviewed for internal consistency.

## Destination

A production-ready reachable iOS app in which an ordinary Guardian can use the app without provider credentials, pass the server-authoritative entitlement and consent gates, generate a visible Storybook, understand progress and failure, use a responsive app, and reach a release gate backed by deterministic and production-like evidence. Provider spend is bounded, attributable, and stoppable.

## Scope boundary

### In scope

- First-open demo, sign-in, trial/paywall and entitlement readback.
- Character creation and the existing Baby/Adult Persona + consent/moderation paths.
- Brief → text → Page generation, Bedtime and Learning Story Types, progress, terminal state, reader, finalization, and PDF export.
- Journal/Daily Notes capture and timeline; the restored reachable Journal path is required for release. Deferred heavy machinery remains inert where cut.
- Real fal.ai LoRA/illustration lifecycle, signed callbacks, owned artifacts, and bounded recovery.
- Cold-start, API, hydration, payload, image-serving, polling, and native rendering performance.
- Server-owned Anthropic/fal credentials, subscription/allowance, metering, kill switches, RLS, and Hard-delete evidence.
- Production-like native smoke and App Store/EAS release evidence for the reachable surface.
- A Super.Engineering Run launcher that uses the current workspace path, starts the local dependencies, boots Simulator, and opens the current Lullabook app. It is a post-planning implementation ticket, not a release proof.

### Explicitly out of scope

- New audio, voice cloning, video, invitations, Android, Personalized Classics, custom Style LoRA, Share links, or a new web creation surface.
- Unlimited generation, silent paid overage, or exposing provider keys to users.
- Real minor photos in canaries. Use synthetic subjects or documented consenting adults only.
- Automatic production deployment or App Store submission as part of the coding tickets. The release gate may identify human-owned blockers.

## Locked product and architecture decisions

1. **Provider access:** users never need Anthropic or fal.ai accounts or keys. The backend owns provider credentials and calls providers through adapters. No secret is permitted in the Expo bundle.
2. **R1 economics:** retain ADR-0028's `$14.99/month` or `$119.99/year`, annual selected by default, up to three trained Personas, and four completed 12-Page Storybooks per monthly reset. The allowance is shared by the Family and is server-authoritative.
3. **Free path:** a Character-only Brief may create a text-viewable Storybook without biometric data or a paid image call. It uses deterministic local placeholder art, never raw photos and never a fake likeness.
4. **Generation queue:** production must dispatch through the durable workflow adapter. A production configuration without a usable Inngest event key fails closed; it must not run provider work inline in the HTTP request. Local inline execution is test/development-only and must be explicit.
5. **Story contract:** R1 Storybooks contain exactly twelve ordered Pages/Scenes. Invalid, refused, or truncated text fails before illustration spend. A failed Page is a re-rollable hole; failed text produces terminal `failed` and releases the Story allowance.
6. **Persona lifecycle:** one production Persona-creation protocol owns moderation-before-persistence, signed fal callbacks, owned artifact copying, review samples, and the `training → review → likeness-confirmed → Story-ready` transitions. `review` is the canonical post-training state for this plan; it must be reconciled with the existing `training → ready/failed` domain vocabulary so `ready` never means Story-ready before likeness confirmation. A Persona in `review` cannot generate Stories. Legacy success paths cannot be reachable from production composition.
7. **Spend controls:** every payable provider attempt is pre-authorized against a versioned price table, recorded with ownership and terminal outcome, and blocked by a red threshold. A failed text pass or watchdog failure releases the Story reservation; existing drafts and Hard-delete remain available.
8. **Release evidence:** deterministic fakes prove contracts; release evidence must additionally prove the native route, real request IDs, provider/model/endpoint identity, actual cost reconciliation, RLS, Hard-delete, and recoverable failure behavior. Paid smoke requires explicit human approval and a hard budget.
9. **Launcher:** the Super.Engineering launcher uses `$SUPERCONDUCTOR_WORKSPACE_PATH`; it never hardcodes this checkout. It starts a safe development profile, waits for readiness, starts the IPv4 Metro proxy, then invokes the existing iOS launch command.

## Current evidence and problem statement

- The 2026-08-01 live run proved real Anthropic text generation and persistence: a 12-Page `draft` was readable. It did not prove real illustrations, Persona training, PDF export, Hard-delete, or a native paid flow.
- The mobile create request has no timeout. Local workflow configuration can run the complete generation inline before persistence returns, so the Generate button can look frozen.
- The reader polls a full Storybook payload every 2.5 seconds and hides useful text while generation is in progress.
- The authenticated read path hydrates a large Family graph repeatedly; image/avatar routes can repeat that work and roster avatar requests lack the required bearer header.
- The production-provider and economics tests have historically been stronger than their wiring. Signed callback services, metering, artifact inventory, and release composition must be proven on the path the app actually uses.
- Current repository documents and code have drifted. A green deterministic suite is not evidence that fal.ai, Inngest, RevenueCat, PostgreSQL RLS, or native Simulator flows work live.

## Invariants

### Performance and responsiveness

- **PERF-1:** `POST /api/storybooks` returns a persisted `generating` record without provider work in p95 `< 2s`.
- **PERF-2:** Story text p95 is `< 25s`; a complete 12-Page local production-like run p95 is `< 90s`.
- **PERF-3:** The five-minute generation watchdog is a hard ceiling. Every run reaches `draft` or `failed`; no run remains `generating` after reaping.
- **PERF-4:** App cold start to interactive is `< 3s`; reader page turn is `< 100ms`; Storybook detail payload is `< 500KB` and never embeds base64 images.
- **PERF-5:** A generating reader shows server-derived phase and `pagesReady/pagesTotal`, renders text as soon as it exists, backs off polling, pauses in the background, and makes no more than 40 status requests during a five-minute run.
- **PERF-6:** An authenticated read endpoint uses no more than two sequential Supabase query waves after the read-profile split; instrumentation records timing, query count, and wave count without secrets.

### Failure and recovery

- **FAIL-1:** Provider refusal, timeout, malformed output, rate limit, or network error is typed, visible, retryable where safe, and never a silent hang.
- **FAIL-2:** Invalid text reaches terminal `failed` before any image call. Failed text and watchdog reaping release the Story reservation exactly once.
- **FAIL-3:** A no-Persona/Character-only Brief produces twelve text-viewable Pages with deterministic placeholder art and zero fal image calls.
- **FAIL-4:** A failed image Page remains a re-rollable hole and does not discard valid Story text. Repair is bounded, metered, and never silently becomes the default path.
- **FAIL-4a:** Each re-roll creates a new Page candidate within the Storybook re-roll budget; finalization persists one selected candidate per Page and rejects an unresolved Page.
- **FAIL-5:** Duplicate, stale, malformed, or out-of-order fal callbacks cannot advance state twice, copy an artifact twice, or spend twice. A real training failure reaches durable `failed`.
- **FAIL-5a:** Guardian likeness acceptance transitions `review → likeness-confirmed → Story-ready`; retraining returns to `training`; a Persona in `review` or `training` is rejected before Story spend.
- **FAIL-6:** RevenueCat purchase, refund, billing issue, expiration, webhook replay, and restore failures leave server entitlement authoritative and fail closed.
- **FAIL-7:** A red cost/kill-switch threshold blocks new payable work while existing drafts, inspection, and Hard-delete remain available.

### Security, privacy, and permissions

- **SEC-1:** Provider keys and privileged Supabase keys remain server-side. No `EXPO_PUBLIC_*` secret, dev password, force-subscription flag, liveness bypass, or fallback flag ships in a release profile.
- **SEC-2:** Baby Persona creation requires jurisdiction-configured verified consent and moderation before durable source-photo persistence or provider submission. Moderation outage fails closed.
- **SEC-3:** Fal callbacks verify timestamp, body hash, and signature before business dispatch. Provider URLs are temporary inputs, never owned blob keys.
- **SEC-4:** Every API response and cache remains Family-scoped. RLS, not only application checks, denies cross-Family reads and writes.
- **SEC-5:** Raw child photos and provider artifact paths never appear in ordinary roster/read payloads or UI surfaces. Hard-delete removes database, blob, context, derivative, and provider-owned artifacts where the contract permits.
- **SEC-6:** A caching or performance optimization never crosses Family/session boundaries; sign-out clears private caches.

### Economics and release

- **COST-1:** The Family allowance is atomic and shared. No per-Persona multiplication, unbounded rollover, or silent paid overage exists.
- **COST-2:** Every payable attempt records provider, endpoint, model, pricing version, units, estimated/actual cost, latency, request ID, owner IDs, and terminal outcome without prompts/photos/credentials.
- **COST-3:** Typical delivery margin targets 75–80%; the annual full-cap/P95 margin floor is approximately 70%; variance is green `≤5%`, amber `>5–10%`, red `>10%`.
- **COST-4:** The model/provider bakeoff is capped at `$10`, uses synthetic/consenting-adult fixtures, requires fresh explicit approval, and cannot change production routing automatically.
- **COST-5:** The final native/provider smoke is a separate fresh approval capped at `$2`; its budget is never confused with the `$10` bakeoff.
- **REL-1:** A release claim requires both deterministic proof and production-like/native evidence. Skipped Playwright/Maestro/live-provider steps are not passes.
- **REL-2:** The final reachable-app smoke covers sign-in, entitlement, consent, Persona/Character creation, Bedtime and Learning Story generation, reader/finalize/PDF, Journal/Daily Notes, failure recovery, RLS, and Hard-delete. Deferred heavy Journal machinery and cut audio, video, invitations, and Share-link surfaces must be proven inert.
- **REL-3:** The EAS/native release profile has a machine-checked bundle/config scan that fails on provider keys, privileged Supabase keys, `EXPO_PUBLIC_DEV_PASSWORD`, `DEV_FORCE_SUBSCRIPTION`, `DEV_LIVENESS_BYPASS`, `DEV_FAL_FALLBACK`, demo-seed enablement, or equivalent bypasses.

## Dependency waves

The complete ticket set is in `plans/reachable-app-release-readiness/TICKETS.md`.

- **Wave A — generation spine:** queue/terminal contract → progress/reader; Persona callback lifecycle; placeholder/exact-12 contract; allowance/spend boundary.
- **Wave B — responsiveness spine:** instrumentation → read hydration/blob serving → polling/startup/render optimization.
- **Wave C — user access and release:** RevenueCat lifecycle and canonical pricing → production-like canary/release evidence (including existing EAS/native-build Wayfinder #135) → whole reachable-app gate → Super.Engineering launcher.

No paid canary, App Store action, or Simulator launcher claim can substitute for the implementation and evidence gates above.

## Human-owned approvals

Before live provider use, the Guardian must approve the `$10` bakeoff and separately approve the `$2` final smoke, rotate the credentials previously pasted into chat, provision new server-only credentials, choose synthetic/consenting-adult fixtures, configure provider billing caps, and accept the canary's model/routing decision. Existing Wayfinder #135 must provide native/EAS build evidence before the release gate. Before App Store work, the Guardian owns Apple Developer/App Store Connect/RevenueCat/EAS accounts, legal review, privacy disclosures, sandbox purchase, and TestFlight review.

## Out of scope for this planning run

Audio/video/invitations/Android/new web creation, production deployment, App Store submission, and any use of the compromised credentials. The Super.Engineering launcher is planned as a ticket and is configured only after this planning handoff is published.
