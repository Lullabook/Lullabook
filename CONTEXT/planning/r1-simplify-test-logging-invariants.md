# R1 Simplification + Test/Logging — Locked Decisions & Invariants

> Grilled 2026-06-23. This doc is the invariants gate for a two-PRD `/part1` wave that
> sits **on top of** the already-planned R1 release (PRD v14) and UI polish (PRD v15):
>
> - **PRD v16 — Ruthless R1 cut.** Take the R1 scope and cut harder, per the founder's
>   call, so R1 is actually finishable. The cut is enforced as *server-side gating with no
>   dead UI*, not just hidden buttons.
> - **PRD v17 — Test framework + honest seed harness + automatic logging.** Give the agent
>   a way to verify the app itself and a place where every runtime bug is captured the
>   moment it happens, so debugging never restarts from zero.
>
> It **amends** the R1 scope locked in
> [`r1-release-scope-and-invariants.md`](r1-release-scope-and-invariants.md) where noted, and
> touches ADR-0024 (family accounts) and ADR-0025 (two-plan). Those amendments are recorded
> here and in the PRDs; no decision is reversed silently.

## Why this exists

Two problems blocked R1 from being real:

1. **Scope is still too wide to finish.** Even after v14's cut (iOS-only, one baby, Bedtime),
   the surface still carries audio (voice clips/messages, lullaby weave, narration), the
   multi-member "family" collaboration plan, multi-baby households, and an Asia+US
   multi-jurisdiction engine (the flagged long pole). Each is a half-built feature that *adds
   ways to break* without serving the one R1 promise: **one parent makes one real illustrated
   bedtime story starring their baby.**
2. **"It doesn't work when I test it" is a feedback-loop failure, not just bugs.** Three
   things compound: illustrations fail silently (already targeted by issues 122–123); there is
   no honest seed or agent-runnable harness, so every manual test starts from nothing and dies
   somewhere new; and **nothing captures the failure** — no log store, no error tracker — so
   each debugging round re-derives the bug from scratch. The founder rated all three equally
   painful.

PRD v16 attacks (1). PRD v17 attacks (2).

---

## PRD v16 — Locked decisions (the cut)

| Area | R1 decision | Consequence / delta vs v14 |
|------|-------------|----------------------------|
| **Audio** | **Cut entirely.** No voice clips, no voice messages, no lullaby weave, no AI narration in R1. | v14 already deferred voice; v16 makes it an enforced cut — record/play UI removed, voice endpoints disabled server-side. |
| **Multi-family** | **Cut entirely.** No invited members, no family logins, no "Our Whole Family" collaborative plan, no multi-baby households. **Solo Guardian, one baby.** | Confirms v14; *enforces* it — family-invite / invited-member / voice-message endpoints disabled server-side, not just hidden. Defers ADR-0024. |
| **Subscription** | **Solo only.** The collaborative/family plan is cut. One or more **solo** price points may remain (config), but **no plan unlocks multi-member collaboration.** | Reconciles the founder's "multiple subscriptions, solo only" with already-drafted issue 129 (collapse to one plan): 129's family-plan cut stands; tier *count* among solo plans is a config detail layered on 129, not a new build. Amends ADR-0025. |
| **Jurisdiction** | **US-only for R1.0.** The multi-jurisdiction engine ships **config-driven** but with **only the US market enabled**; Asia is a flagged-off R1.1 fast-follow. | Cuts the flagged long pole. v14 itself flagged US-first sequencing; v16 commits to it. The engine stays config-driven so enabling Asia later is a data change, not a rebuild (ADR-0015). |
| **Daily Notes** | **Kept (minimal).** Daily note / Moment capture stays in R1 (solo, one baby). | **Un-defers** the v14 cut of Journal/Moments — but only the lightweight daily capture. The heavy machinery (Story Context Engine, Firsts, Birthday Story, weekly suggestion, photo-to-story, auto-context injection) **stays deferred**. |
| **Story creation** | **Kept — the centerpiece.** Illustrated Bedtime storybook generation, the core loop. | Unchanged from v14 Track A. |
| **Everything else** | **Stays deferred** per v14's R2+ list. | Video pages, custom art style (Style LoRA), personalized classics, roster avatars, share links, adult/multi-persona, Learning story type, web surface. |

**The simplification invariant that makes this worth doing:** a cut feature must be **inert,
not broken**. Deferring something means it is *gated server-side* and *has no reachable UI* —
never a dead button, a 500-ing endpoint, or a spinner that never resolves. Fewer live surfaces
is the entire point; a half-removed feature is worse than a kept one.

---

## PRD v17 — Locked decisions (verify + capture)

| Area | Decision | Consequence |
|------|----------|-------------|
| **Test framework** | Extend, don't replace. Keep Vitest (unit/integration, `tests/**`) + Playwright (web e2e, `e2e/**`). **Add a mobile/Expo e2e path** (the iOS app — the actual shipping surface — currently has none) and **one agent-runnable `verify` command** that runs the whole suite and exits 0 exactly when the app is healthy. | The agent gets a single gate to loop against instead of judging "done" by eye. |
| **Honest seed harness** | A deterministic, repeatable fixture: one command yields a known-good Household + baby + family + a **real illustrated Bedtime book**. Builds on R1 issue 124's honest seed; generalizes it into a test fixture so testing never starts from zero. | Double-gated (`NODE_ENV !== "production"` AND a flag), inert in prod. |
| **Logging backend** | **Vendor chosen by research fan-out** (Expo + Next.js + Supabase, solo dev, child-data-sensitive, cheap). Captures runtime errors from **both** the Expo app and the Next.js API into a queryable store/dashboard automatically, with enough context (stack, breadcrumbs, release, request) to debug without re-reproducing. | The "HockeyApp" ask, modernized. (App Center/HockeyApp lineage confirmed by the research step.) |
| **Error → issue** | A captured error can become a **tracked issue** (native issue view or GitHub/Linear integration), deduped, so "bugs instantly go to a database" and surface as work items. | Closes the feedback loop the founder is missing. |

---

## Invariants (testable; the PRDs and issues must restate the relevant ones)

### Latency / performance budgets

**v16 (the cut must not regress R1):**
- Removing audio/multi-family code must not regress the R1 budgets in
  `r1-release-scope-and-invariants.md` (Demo Story < 1s, cold start < 3s, reader page turn
  < 100ms, storybook detail payload < 500KB).
- Cold start must not *grow* from the cut — ideally shrinks as dead code/screens are removed.

**v17 (the harness must be fast enough to loop on):**
- The agent-runnable `verify` suite (unit + integration + web e2e + smoke) completes in
  **< 5 min** locally so an agent can iterate, and is deterministic (uses `DEV_FAL_FALLBACK`,
  no live keys).
- Logging adds **< 10ms** to an API request on the happy path and is **fire-and-forget** —
  capture is async and never blocks a response or a render.
- The deterministic seed produces identical data for the same seed input (reproducible).

### Failure modes

**v16:**
- A deferred feature **fails as "absent," never as an error**: no dead UI, no endpoint that
  500s, no spinner with no terminal state. Hitting a disabled endpoint returns a clean
  `404`/`403`, not a crash.
- The US-only jurisdiction engine: a request from an unsupported (non-US) market is handled by
  the same config path (clean "not available in your region" or US default), **never**
  hardcoded and never a crash.

**v17:**
- **Logging fails OPEN** (the deliberate opposite of moderation, which fails closed): if the
  error store/SDK is unreachable, errors are dropped/buffered silently and **the app keeps
  working**. A logging outage must never take down a request, a render, or a generation.
- The seed/test-bypass flags are **double-gated and inert in production** (same contract as the
  R1 dev flags). A failed seed leaves no partial Household.
- The `verify` command exits **non-zero on any real failure** and produces a readable summary —
  it must not green-wash a broken app (no swallowed failures, no skipped-as-passed).

### Security / permission boundaries

**v16:**
- Cutting multi-family must **close authz holes, not open them**: family-invite,
  invited-member, and voice-message endpoints are **disabled server-side**; create-rights
  default to **solo-Guardian-only**; one-baby-per-Household enforced server-side. Hiding a
  button is not a cut — the server gate is the cut.
- All R1 security boundaries from `r1-release-scope-and-invariants.md` still hold (Baby Persona
  gated by `consent_verified`; raw child photos write-only; likeness egress only via PDF
  Export; hard-delete always available; secrets server-side only).

**v17 — the COPPA/GDPR line is the load-bearing one:**
- The logger **must never capture child photos, biometric/LoRA data, PII, consent tokens,
  auth tokens, or any secret.** Payload scrubbing/denylisting is mandatory and tested; session
  replay (if the vendor offers it) is **off** on any screen that shows a photo or a child's
  name. This is a hard gate, not a config nicety.
- The log-ingest endpoint (if self-hosted) is authenticated and rate-limited; the error store
  honors the same data-residency expectations as the rest of the app.
- Source maps / symbolication are uploaded **server-side / build-time only** — never shipped in
  the Expo bundle, and never expose a secret.

---

## ADR amendments this wave records
- **ADR-0024 (family accounts / collaborative creation):** R1 ships **solo only**; invited
  members and family logins return in R2 when audio/video/collaboration features exist.
  (Deferral, not reversal.)
- **ADR-0025 (two-plan monetization):** R1 ships **solo subscription(s) only**; the
  collaborative "Our Whole Family" plan is cut until its features exist. (Amendment; consistent
  with already-drafted issue 129.)
- **ADR-0015 (multi-jurisdiction launch):** R1.0 enables **US only**; Asia is a config-flagged
  R1.1 fast-follow. The engine stays config-driven (no hardcoding). (Sequencing, not reversal.)
- A light **ADR-0026 "R1 simplification scope + test/observability spine"** may be worth
  recording to capture the cut + the logging/observability decision once the vendor is picked.
  Flagged, not written here.
