# PRD v14 — R1: the first shippable release (iOS, the loop that actually works)

> Status: ready for agent. Planning artifact from `/part1` (2026-06-23). Grounded in a
> 3-agent research fan-out (ground-truth implementation audit, R1-scope analysis, UI gap)
> + hands-on Simulator testing. Decisions & invariants locked in
> [`r1-release-scope-and-invariants.md`](r1-release-scope-and-invariants.md). UI polish is a
> **separate** wave — [PRD v15](prd-v15-ui-native-polish.md).

## Why this wave

The audit's headline: **the product is built, not absent.** Real Claude text generation,
real DB, real server-side entitlements/caps/credits, real auth, real voice & moments all
work. The app *looks* empty for two fixable reasons — (1) **every fal.ai illustration call
is failing** (48/48 on the test box; books silently degrade to text-only), and (2) **no
honest seed** (the demo seed is flag-disabled and writes empty page-less books). Persona
LoRA training is also **faked in local dev**.

R1 is therefore **not new features**. R1 is: *make the existing core loop visibly produce
one real illustrated bedtime story starring the child, behind a legally-clean iOS consent
+ payment gate, in the Asia+US markets, and ship it.* Everything that doesn't serve that
single promise is deferred (see the decisions doc's defer list).

## Locked decisions (from the grill)

Platform **iOS-only** · payment **RevenueCat IAP** · consent **Email-Plus VPC** · market
**Asia + US** (jurisdiction engine real, ⚠️ the long pole) · **one plan** + 7-day trial ·
**one Baby Persona / solo Guardian** · **Bedtime** story type · **PDF Export, no Share
links** · **free re-rolls, no credit metering** · **baby-free Demo Story** aha. Full table
+ rationale in the decisions doc.

### Track A — "The loop actually produces a real illustrated story" (the centerpiece)
- **Diagnose & fix the fal.ai illustration failure.** Find why 100% of image calls fail
  (key / endpoint / model / quota) and fix it so a book reaches `draft` *with real images*.
- **Honest dev path:** `DEV_FAL_FALLBACK` placeholder images + a **real** `DEV_DEMO_SEED`
  that generates a populated baby + family + a Bedtime book **with actual text and images**
  (not empty display rows). Double-gated (`NODE_ENV!=="production"` AND flag), inert in prod.
- **Real persona likeness in dev.** Replace the faked `waitForEvent`-synthesized `ready`
  with a path that yields a usable LoRA (or an honest placeholder), so the **likeness
  confirmation** gate is real before any book spend.
- **End-to-end proof:** a single tester signs in → seeds/creates a baby + family →
  generates a Bedtime book → sees illustrated pages → exports a PDF.

### Track B — "Legal gate for iOS" (consent + payment + markets)
- **Email-Plus VPC** end to end: attest guardianship → emailed notice-versioned single-use
  link → confirm → `consent_verified` + version-stamped receipt → delayed revoke link.
  **Server-gates Baby Persona creation.** (ADR-0008/0018.)
- **RevenueCat IAP:** 7-day trial start, **server-authoritative** Household-level
  entitlement flip, restore-purchases, sandbox-tested.
- **Collapse to one plan:** hide Our Whole Family until its features exist (amends ADR-0025).
- **Multi-jurisdiction engine real for Asia+US:** consent method, child-age threshold,
  data-residency region, retention/notice — **config-driven per market**, not hardcoded,
  with a per-market legal-review checklist gating launch (ADR-0015).

### Track C — "Keepsake, safety & release-readiness"
- **PDF Export** of a finalized Storybook to the device (ADR-0007 keepsake-survives-deletion).
- **Moderation fails CLOSED** on the shipping path: CSAM hash + safety classifier on
  uploads, image moderation on outputs, free-text Brief note moderated.
- **Hard-delete** always available; erases all child data across every store (ADR-0007);
  consent revoke routes to purge.
- **Release hardening:** secrets audit (no secret in `EXPO_PUBLIC_*`; dev sim creds never
  in a release build), and **Apple App Review prep** (privacy disclosures + consent flow
  for Guideline 4.2 kids/biometric).
- **Demo Story:** pre-baked, baby-free, illustrated, loads < 1s before any sign-up/paywall.

### Packaging & order
**One PRD, three tracks → one R1 PR (planning).** Build order **A → B → C**: A makes the
app demonstrably work (and is the riskiest unknown — the fal fix), B makes it legally
shippable on iOS, C makes it safe & exportable. Issues **122–135**.

## Invariants (acceptance constraints — the PASS/FAIL contract)

Restated from the decisions doc; every issue touching one must repeat it in its criteria.

### Latency / performance
- Demo Story < **1s**; story text p95 < **30s**; per-page illustration p95 < **60s**; whole
  book terminal within the **5-min watchdog** or surfaces timeout — never infinite
  "Illustrating"; LoRA `ready`/`failed` < **15 min**; cold start < **3s**; reader page turn
  < **100ms**; storybook detail payload < **500KB** (signed URLs, no inline base64).

### Failure modes
- **Claude**: error → retry once → else `failed` + re-roll; refusal/empty → `failed`, never blank.
- **fal.ai**: image fail → re-rollable hole + text-viewable draft; LoRA fail → persona
  `failed`, no charge; watchdog forces terminal. **R1 must also actually fix the 100%
  image-failure** + ship `DEV_FAL_FALLBACK`.
- **Supabase**: outage → auth fails **closed**; no partial persona/consent writes.
- **RevenueCat/IAP**: purchase fail → entitlement does **not** flip; restore path; trial
  needs a successful IAP.
- **Email-Plus VPC**: send fail → consent **not** granted, Baby Persona **blocked**,
  retryable; link notice-versioned + single-use; revoke always available → purge.
- **Moderation**: **fails CLOSED** — unavailable → block, never allow.

### Security / permission boundaries
- Baby Persona gated by server-verified `consent_verified`; **dev seed/liveness/sub
  overrides inert in production**. Household RLS isolation; raw child photos write-only,
  never rendered; **likeness egress only via user-initiated PDF Export** (no Share links).
- Hard-delete always available. Secrets server-side only. IAP entitlement Household-level.
- Apple App Review (4.2) is a **launch gate**.

## Tracks → issues

| Track | Issues | Theme |
|-------|--------|-------|
| **A — Loop actually works** | 122–126 | fal fix · honest seed · real likeness · e2e proof |
| **B — iOS legal gate** | 127–131 | Email-Plus VPC · RevenueCat IAP · one-plan · jurisdiction engine |
| **C — Keepsake/safety/release** | 132–135 | PDF export · moderation-closed · hard-delete · secrets+App-Review · demo story |

Each issue ships a runnable `Verification-command` (its machine-checkable done-condition) so
`/part2`'s maker→checker loop has a real gate. The handoff names the start issue (**122**).

> **Sequencing risk (flagged):** Asia+US multi-jurisdiction (issue 130) is the long pole
> and is in tension with the lean "make-the-loop-work" goal. If it threatens the date,
> sequence US-first (R1.0) and Asia fast-follow (R1.1) — the jurisdiction engine is built
> config-driven precisely so that's a data change, not a rebuild.
