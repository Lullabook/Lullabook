# Session handoff — 2026-07-07 — /planner PRD v20 (R1 monetization: entry gates)

## What this session did
Ran `/planner` (planning chain) for **R1 monetization**. Sized it (grillable, **not**
wayfinder — every fork nameable, ADRs already decided the hard product calls), grilled it
against a **codebase read** (the monetization spine is already largely built), locked
invariants, and produced: CONTEXT v20 language, ADR-0027, PRD v20, issues **168–174**, this
handoff. **No application code changed** — planning artifacts only.

## The reframe that drove everything
This is **not greenfield**. Already built: `EntitlementService` (server-authoritative gates),
`StoryCapService` (**enforced** at `storybook.ts:120,183` — ADR-0025's "never called" note is
stale), `CreditLedgerService`, `SubscriptionService`, RevenueCat webhook + adapter,
`EmailPlusVpcService`, `DemoStoryService` + `FirstOpenService`, and `paywall-config` whose
`getR1VisiblePlans()` **already collapses R1 to one plan (Just Us)**. The effort is **wiring
two gates + the mobile purchase path**, not building billing.

Two real gaps, both load-bearing:
1. **Payment does nothing** — no `react-native-purchases` in `mobile/package.json`; paywall
   CTA is `router.dismiss()`; no 403→paywall routing. Native module → can't run in Expo Go.
2. **COPPA hole** — `PersonaService.createBaby` has **no** `consent_verified` check; a Baby
   Persona (minor biometric LoRA) is creatable today with zero VPC.

## Locked decisions (grill 2026-07-07)
- **D1** R1 = one plan (Just Us) — already coded.
- **D2** `PurchaseController` abstraction; **FakePurchaseController** for R1/Simulator; real
  `react-native-purchases` deferred to the **EAS milestone** (thin swap onto same server state).
- **D3** Two gates: payment (trial) **+** Email-Plus VPC consent; separate on iOS (ADR-0018);
  both fail **closed**.
- **D4** Fake `startTrial` → prod-guarded `POST /api/billing/start-trial`, webhook-shaped state.
- **D5** Demo free → wall on first real action; server **403 → paywall**; fail closed.
- **D6** Minimal Demo Story aha in scope (server already serves it; wire mobile 5-step flow).
- **D7** Model `trialEndsAt`; renewal/billing deferred to RevenueCat.
- **Superseded, not rebuilt:** three-tier-era issues 91/92/94/95/99 (services built); credit
  ledger meters nothing in R1 (left in-memory); founding-families = copy-only; demo art = bundled static.

## Invariants (the /coder red-team targets — full text in the PRD)
- **SEC-1** entitlement server-authoritative; **SEC-2** start-trial **prod-guarded** (refuses
  in prod — has a test); **SEC-3** no Baby Persona without `consent_verified`; **SEC-4** both
  gates **fail closed**.
- **FAIL-1** config-fetch → static fallback; **FAIL-2** start-trial fail → stays unentitled;
  **FAIL-3** RevenueCat webhook (deferred) → restore-purchases (EAS follow-up); **FAIL-4**
  consent email fail → stays blocked; **FAIL-5** demo asset fail → skip-to-paywall.
- **PERF-1** cap check <50ms; **PERF-2** paywall paint <500ms; **PERF-3** start-trial <1.5s;
  **PERF-4** demo render <1s.

## Slice order (issues 168–174)
Pillar A (payment): **168** trial model + `activateTrial` → **169** prod-guarded start-trial
endpoint → **170** PurchaseController + Fake → **171** paywall CTA + 403 routing.
Pillar B (consent, independent): **172** `requireConsentVerified` on `createBaby` → **173**
mobile Email-Plus consent flow.
Pillar C (compose): **174** first-open Demo Story + 5-step entry flow (blocked-by 171, 173).

Each issue ships a runnable `Verification-command` (`npx vitest run tests/<n>-*.test.ts &&
npm run verify`).

## Next agent starts at
**Issue 168** (`/coder`). 168 and 172 are both unblocked roots (payment vs consent) and can
go in either order / parallel. Everything is Simulator-verifiable against the verify gate;
**real Apple IAP is out of scope** — it is the separate **EAS/TestFlight milestone** (install
`react-native-purchases`, App Store Connect IAP, RevenueCat project, sandbox, restore-purchases
reconciliation).

## Prior context
- v19 core loop (issues 162–167) is built + /debugger CLEAN but **not verified live and not merged
  to main** — still owed a Simulator sweep. v20 assumes the loop; it does not depend on the
  live sweep landing first, but that sweep should still happen.

## Reference
- PRD: `CONTEXT/planning/prd-v20-monetization-r1.md`
- ADR: `CONTEXT/docs/adr/0027-purchase-controller-fake-first-r1-entry.md`
- Issues: `CONTEXT/issues/168`–`174`
- Glossary: `CONTEXT/CONTEXT.md` (v20 section)
- Branch: `feat/prd-v20-monetization-r1`
