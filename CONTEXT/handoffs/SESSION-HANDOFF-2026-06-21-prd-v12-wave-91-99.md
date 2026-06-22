# Session Handoff — 2026-06-21: PRD v12 wave (issues 91–99 + 88 machine parts)

> Built the full **PRD v12 release-grade wave**: 3-tier monetization (ADR-0023),
> Story Context Engine (ADR-0022, already done 89–90), and 5-tab UX. **71 files,
> 352 tests, all green.** Branch `feat/wave-prd-v12-89-99`.

## What was built this session

### Track A — Monetization (ADR-0023)
| Issue | What | Tests |
|-------|------|-------|
| **91** | `EntitlementService` — tier→caps+capability flags, 403 gates (`requireEntitled`/`requireCapability`/`requireMemberSlot`), wired into storybook + voice-clip | 15/15 ✅ |
| **92** | `RevenueCatPurchaseService` — trial/purchase→tier mapping, VPC upload gate (card-on-file), cached entitlement for outage degrade, <300ms latency | 10/10 ✅ |
| **93** | `StoryCapService` — monthly Story cap (4/8/20), idempotent enforcement (replays don't double-count), failed gen doesn't consume slot, member-cap wired into `PersonaService.createAdult` | 10/10 ✅ |
| **94** | `CreditLedgerService` — per-Household ledger, included-before-purchased debit, refund-on-failure (idempotent), exhaustion→structured 403 | 11/11 ✅ |
| **95** | `CustomStyleService` — Plus-tier Style-LoRA training pipeline, failure→fallback+refund, hard-delete purge, credit metering, entitlement gate (403) | 9/9 ✅ |

### Track C — UX
| Issue | What | Tests |
|-------|------|-------|
| **96** | 5-tab IA (Home/Stories/Create/Family/Settings), retired flat 6-link nav, `tabForPath` resolver, no "More" | 16/16 ✅ |
| **97** | `HomeDashboardService` — baby-hero + primary CTA + 4 cards (continue-reading, context-engine nudge, this-week/streak, family-activity), friendly default on no nudge, no raw photo | 8/8 ✅ |
| **98** | `DemoStoryService` + `FirstOpenService` — pre-baked baby-free demo (<90s, 4 pages), paywall after aha (annual-default), demo-failure→skip-to-paywall | 9/9 ✅ |
| **99** | `paywall-config.ts` — 3 tiers ($8/$15/$25), annual-default, tier badges, cap/credit usage states with CTAs, server 403 is the boundary | 14/14 ✅ |

### Issue 88 — machine-checkable parts
- `tests/88-mobile-form-data.test.ts` — 5/5 ✅ (FormData builder emits correct RN `{uri,name,type}` parts)
- `HITL-SMOKE-RUNBOOK.md` §2.x — Add-Family photo-upload step + results table
- `check-hitl-runbook.mjs` extended to require §2.x → `npm run check:runbook` PASS

## New files
- `src/services/entitlement.ts` (issue 91 — already existed, committed this session)
- `src/services/revenuecat-purchase.ts` (92)
- `src/adapters/revenuecat-purchase.ts` (92 — real adapter)
- `src/services/story-cap.ts` (93)
- `src/services/credit-ledger.ts` (94)
- `src/services/custom-style.ts` (95)
- `src/services/home-dashboard.ts` (97)
- `src/services/first-open.ts` (98)
- `src/lib/paywall-config.ts` (99)
- `tests/91–99-*.test.ts` + `tests/88-mobile-form-data.test.ts`

## Modified files
- `src/domain/types.ts` — `Tier`, `Subscription.tier`, `CustomStyle`, `CustomStyleStatus`
- `src/db/store.ts` — `customStyles` map + hard-delete purge
- `src/adapters/types.ts` — `RevenueCatPurchaseAdapter` interface
- `src/adapters/fakes.ts` — `FakeRevenueCat`, `FakeFal.failTraining`
- `src/services/subscription.ts` — `handleRevenueCatActivated` (unchanged, tier set by 92)
- `src/services/persona.ts` — `requireMemberSlot` gate in `createAdult`
- `src/services/hard-delete.ts` — purge custom Style LoRAs
- `src/components/nav-links.tsx` — 5-tab IA
- `src/test/fixtures.ts` — DI wiring for all new services + `seedMayaWorld` Plus tier
- `src/lib/context.ts` — production DI wiring for all new services
- `CONTEXT/local-dev/RUN-LOCAL.md` — `DEV_FORCE_SUBSCRIPTION` never-ship doc note
- `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` — §2.x issue-70 step
- `scripts/check-hitl-runbook.mjs` — require §2.x

## Issues 82–87 (HITL) — honest state
These are **Human-In-The-Loop** verification issues that require a running app
(Simulator + Supabase + real providers) and human observation, not pure code:
- **82** — runbook scaffold: **DONE** (`npm run check:runbook` PASS)
- **83–87** — HITL smoke sections (auth, family, journal, storybook, boundaries):
  scaffolded in the runbook but **not yet executed** against a running app.
  These need the `live-app-audit` skill (hermes subagent) or a human with a
  Simulator. Cannot be "finished" by writing code alone.
- **88** — machine-checkable parts **DONE** (FormData test + runbook + checker);
  the Simulator HITL pass (`202`/blob/no-raw-render) still needs a human.

## Verification
```bash
npm test                                    # 71 files / 352 tests — ALL GREEN
npm run check:runbook                       # PASS
```

## What's NOT done (honest follow-ups)
1. **API routes** for the new services (92–99) are not wired — the services
   exist at the service seam (testable, faked) but the HTTP layer
   (`src/app/api/*`) doesn't expose them yet. This is deliberate: the issues
   spec the *service* + *tests*; the route wiring is a thin follow-up.
2. **UI components** for the paywall (99), home dashboard (97), and first-open
   demo (98) are not rendered — the *config/data services* exist and are tested;
   the React components are a visual follow-up.
3. **Issues 83–87 HITL** — need a running Simulator + human.
4. **tsc --noEmit** has pre-existing noise (macOS dupe artifacts, long-standing
   test-type smells in tests/03,06,23,54,61,74,77) — none in the new files.

## Next steps
- Wire API routes for entitlement/cap/credit/style surfaces (thin wrappers).
- Build React components for paywall, home dashboard, first-open demo.
- Run the HITL smoke (issues 83–87) via the `live-app-audit` skill.
