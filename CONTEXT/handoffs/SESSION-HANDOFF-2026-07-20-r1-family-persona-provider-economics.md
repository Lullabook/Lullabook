# Session Handoff — 2026-07-20 — R1 Family, Persona, provider, and economics plan

**Branch:** `feat/prd-v20-pillar-a-payment`
**Planning parent:** [GitHub #149](https://github.com/VrajGupta/Lullabook/issues/149)
**Provider umbrella:** [GitHub #136](https://github.com/VrajGupta/Lullabook/issues/136)
**Spec:** `CONTEXT/planning/prd-v21-r1-family-persona-story-economics.md`
**Decision:** `CONTEXT/docs/adr/0028-r1-family-persona-provider-economics.md`

## Accepted outcome

R1 remains one creating Guardian Member with no invitations, but “solo” no longer means one Baby or one Family person. Just Us supports up to three trained Personas in any Adult/Baby combination, up to three starring Personas in a Storybook/Page, and four completed 12-Page Storybooks per monthly reset at `$14.99/month` or `$119.99/year`.

The price/cap is release-gated by a real-provider canary. FLUX.2 LoRA is the target default only if `fal-ai/flux-2-trainer-v2` achieves acceptable likeness at no more than 500 steps and one/two-Persona quality passes. Claude Sonnet 4.6 remains the immediate Story model until Sonnet 5 wins the fixed golden-set bake-off. Lifetime personalization uses the existing bounded deterministic Story Context Engine, initially around 2,000 selected tokens; it never sends an unbounded lifetime transcript.

## Binding invariants

- One creating Guardian Member; invitations/collaboration stay disabled.
- Shared cap of three trained Personas, independent of Adult/Baby kind; no one-Baby restriction.
- Verified Consent receipt before Baby Persona creation; Adult self-consent before Adult training.
- Moderation before durable photo persistence or provider submission.
- Raw photos never appear in ordinary roster UI; use generated Roster avatars.
- One LoRA per Persona; training completion is not Likeness confirmation.
- Real queue submission, signed/idempotent callbacks, and Family-owned LoRA artifacts are required.
- Up to three starring Personas use one multi-LoRA Page request; twelve Pages fan out concurrently.
- Failed Story text releases the Story allowance; a failed Page remains a re-rollable hole.
- Typical post-platform delivery-margin target is 75–80%; annual full-cap/P95 target is approximately 70%.
- Provider fake success is development-only and cannot satisfy release evidence.
- Database RLS and Hard-delete cover database rows, photos, derivatives, context, LoRAs, and provider artifacts.

## Published dependency-ordered tickets

| Local | GitHub | Ticket | Blocked by | Verification command |
|---:|---:|---|---|---|
| 176 | [#150](https://github.com/VrajGupta/Lullabook/issues/150) | Budget-gated real-provider bake-off and model decision | None | `npx vitest run tests/176-provider-bakeoff-contract.test.ts && npm run verify`; paid opt-in: `LIVE_PROVIDER_BUDGET_USD=10 npm run smoke:provider-bakeoff` |
| 177 | [#151](https://github.com/VrajGupta/Lullabook/issues/151) | Accepted R1 Family and Just Us plan invariants | #150 | `npx vitest run tests/177-r1-family-plan-entitlement.test.ts && npm run verify` |
| 178 | [#152](https://github.com/VrajGupta/Lullabook/issues/152) | Atomic consent-safe Family/Persona creation | #151 | `npx vitest run tests/178-atomic-consent-safe-persona.test.ts tests/rls-isolation.test.ts && npm run verify` |
| 179 | [#153](https://github.com/VrajGupta/Lullabook/issues/153) | Real FLUX LoRA ZIP/queue/signed-webhook lifecycle | #150, #152 | `npx vitest run tests/179-fal-lora-contract.test.ts tests/179-fal-webhook.test.ts && npm run verify` |
| 180 | [#154](https://github.com/VrajGupta/Lullabook/issues/154) | Native Likeness confirmation and waiting-Brief resume | #153 | `npx vitest run tests/180-likeness-readiness-cold-start.test.ts && npm run verify` |
| 181 | [#155](https://github.com/VrajGupta/Lullabook/issues/155) | Bounded lifetime Story Context and 12-Page Sonnet contract | #151 | `npx vitest run tests/181-story-context-sonnet-contract.test.ts && npm run verify` |
| 182 | [#156](https://github.com/VrajGupta/Lullabook/issues/156) | Concurrent multi-Persona Pages and bounded repair | #150, #154, #155 | `npx vitest run tests/182-multipersona-page-fanout.test.ts && npm run verify` |
| 183 | [#157](https://github.com/VrajGupta/Lullabook/issues/157) | Provider COGS metering and kill switches | #150, #151 | `npx vitest run tests/183-provider-cost-metering.test.ts && npm run verify` |
| 184 | [#158](https://github.com/VrajGupta/Lullabook/issues/158) | RLS and Hard-delete proof for provider/context artifacts | #152, #153, #157 | `npx vitest run tests/184-provider-artifact-delete-rls.test.ts && npm run verify` |
| 185 | [#159](https://github.com/VrajGupta/Lullabook/issues/159) | Production-like native real-provider release gate | #154, #155, #156, #157, #158 | `npm run verify`; paid opt-in after separate authorization: `LIVE_PROVIDER_BUDGET_USD=2 npm run smoke:r1-provider-e2e` |

## Frontier and recommended next ticket

Start with **local 176 / GitHub #150**. It is the only unblocked implementation ticket. Its `$10` budget is the already-approved research ceiling, not a per-Story allowance. It must stop instead of escalating FLUX.2 training beyond 300 steps if that would exceed the authorized run.

After #150 resolves:

1. Lock its routing/step-count evidence into the plan implementation at #151.
2. #152 and #155 can proceed after #151.
3. #153 waits for both #150 and #152.
4. #157 can proceed after #150 and #151.
5. Follow the published blocking graph to #159.

## Current evidence and known gaps

- Deterministic verification before this planning wave: `npm run verify` passed; 127 test files / 740 tests passed; focused Family/Persona/consent/Story suite passed 68 tests.
- Planning-wave verification: `npm run verify` passed again (root/mobile typecheck, Vitest, Sentry automation, dead-surface and deterministic-seed checks); browser Playwright remained skipped because no server was running.
- Kaizen Domain Coach passed glossary, organization, architecture/secrets, and tests (8/10), but its extra `next build` failed on the pre-existing `@typescript-eslint/no-require-imports` error in `src/instrumentation.ts`. This planning diff does not touch that source file; the generated `next-env.d.ts` change was removed before staging.
- No paid provider calls were run during planning; recorded spend is `$0`.
- Current Anthropic adapter already uses JSON-schema structured output. Work is semantic validation, golden-set routing, usage/stop evidence, and output safety ceiling—not adding structured output from scratch.
- Current fal training sends the wrong input shape; V2 requires one ZIP URL.
- Current callback path does not verify the provider signature.
- Current LoRA URL ownership/deletion semantics are wrong.
- Native Likeness acceptance is not reachable.
- Persona-ready does not resume the cold-start Brief.
- Current image work is sequential and the multi-Persona inpainting assumptions are invalid.
- Story Context and continuity code exist but were previously R1-gated; PRD v21 restores only the bounded engine, not all deferred Journal suggestions.
- Browser/provider release readiness remains unproven until #159.

## Open decisions

- Whether 300 or 500 FLUX.2 V2 steps meet the likeness rubric. More than 500 blocks the accepted price/cap.
- Whether FLUX.2 or FLUX.1 wins default routing after training amortization and multi-Persona quality.
- Whether Nano Banana 2 alone is sufficient for Page repair or Pro escalation is necessary.
- Whether Sonnet 5 beats current Sonnet 4.6 on the Story golden set.
- Exact bounded concurrency after real latency/rate-limit evidence.
- Any additional paid canary budget after the approved `$10`; #159’s separate live smoke requires explicit authorization at implementation time.

## Git safety

The pre-existing untracked directories `.agents/`, `.codex/`, and `codex-native-selector/` are unrelated local tooling and must not be staged. No secrets or provider credentials belong in the planning commit or GitHub artifacts.
