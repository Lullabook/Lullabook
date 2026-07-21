# PRD v21 — R1 Family, Persona, Story Context, provider, and unit-economics spine

> Accepted 2026-07-20 after provider, context, and subscription-economics research. This effort turns R1 “solo” into one Guardian Member with a multi-person Family, proves the real LoRA/Storybook path, and makes the accepted subscription envelope enforceable and observable. It does not add invitations or collaboration.
>
> Published specification: [GitHub issue #149](https://github.com/VrajGupta/Lullabook/issues/149).

## Problem Statement

R1 currently treats “solo” as one Guardian and one Baby in several places, even though the product promise is a Guardian creating Stories about the people and babies in their Family. The deterministic test suite is green, but it can report success while real fal.ai work is absent or invalid: the training payload does not match the provider archive contract, local workflow completion can synthesize a ready LoRA, callbacks are not authenticated, provider artifacts are not copied into Family-owned storage, and the native app cannot complete Likeness confirmation. Multi-Persona illustration uses an invalid inpainting assumption and Pages are generated sequentially.

The current `$9.99/month` / `$79.99/year`, eight-Story plan is also incompatible with a healthy heavy-user margin once Apple, RevenueCat, refunds, text generation, twelve illustrations, moderation, retries, storage, and Persona training are included. Finally, the already-built Story Context Engine is disabled in R1, preventing Stories from using the relevant history accumulated through Moments, Family relationships, and prior Stories.

## Solution

Ship one R1 plan in which one Guardian Member controls a Family with up to three trained Personas in any Adult/Baby combination and creates up to four completed 12-Page Storybooks per month. The accepted price is `$14.99/month` or `$119.99/year`. Invitations remain disabled.

Before production routing is locked, run a hard-capped `$10` canary using synthetic subjects or consenting adults. Compare FLUX.1 LoRA, FLUX.2 LoRA trained with the current V2 trainer, and selective reference-edit repair; compare current Claude Sonnet 4.6 against Sonnet 5 on a fixed Story golden set. FLUX.2 LoRA is the target default only if acceptable likeness is achieved at no more than 500 training steps and multi-Persona quality passes the rubric. Otherwise stop and reopen the price/cap/model decision.

Make the production path real and auditable: consent and moderation precede persistence/training, the backend creates the provider-required ZIP, submits durable queue work, verifies signed webhooks idempotently, copies LoRA weights into Family-owned storage, exposes generated review samples, requires Likeness confirmation, and only then permits Story spend. Generate up to three starring Personas together through one multi-LoRA call, fan twelve Pages out concurrently, and route only failed/high-value Pages through a bounded repair path.

Re-enable bounded deterministic Story Context: the full authorized history remains retrievable, while each Prompt receives an approximately 2,000-token relevant context set with protected cast, Significant Moments, age/Firsts, and bounded past-Story continuity. Preserve the existing Anthropic structured-output seam, compare Sonnet versions before switching, and add semantic Story validation.

Meter every provider attempt and successful Storybook. Release only when normal and P95 costs, failure behavior, RLS isolation, Hard-delete, and a real provider-backed mobile flow are proven.

## User Stories

1. As a Guardian, I want one account to represent my Family, so that “solo” does not mean only one person can appear in Stories.
2. As a Guardian, I want to add Adult and Baby Personas from one shared allowance, so that the plan does not impose an arbitrary one-Baby rule.
3. As a Guardian, I want up to three trained Personas, so that a Baby can star with siblings or adults.
4. As a Guardian, I want relationships and per-Baby nicknames saved with the Family roster, so that Stories use the right Family language.
5. As a Guardian, I want Baby creation to fail before any photo is retained when consent is absent, so that child photos are never persisted unlawfully.
6. As an Adult Persona subject, I want self-consent checked before training, so that my likeness is not trained without permission.
7. As a Guardian, I want uploaded photos moderated before training, so that unsafe material never enters the LoRA pipeline.
8. As a Guardian, I want roster surfaces to show generated Roster avatars rather than raw photos, so that source photos stay private.
9. As a Guardian, I want real training progress and failure states, so that a fake completion never tells me a Persona is ready.
10. As a Guardian, I want to review generated likeness samples, so that training completion is not mistaken for acceptable likeness.
11. As a Guardian, I want to accept or reject a likeness in the native app, so that Story spend starts only after approval.
12. As a Guardian, I want a Brief created during training to resume automatically after approval, so that onboarding does not lose my intent.
13. As a Guardian, I want up to three starring Personas in one Storybook, so that the people in a Scene retain distinct identities.
14. As a Guardian, I want every Storybook to have twelve Pages generated quickly, so that I do not wait on a sequential image pipeline.
15. As a Guardian, I want a failed Page to remain a re-rollable hole, so that one provider error does not destroy valid Story text.
16. As a Guardian, I want difficult Pages repaired without regenerating the whole Storybook, so that recovery is fast and bounded in cost.
17. As a Guardian, I want Stories to use relevant Moments, Family facts, and prior Stories, so that personalization improves throughout the life of the app.
18. As a Guardian, I want to know which retained inputs shaped a Story, so that personalization is understandable rather than opaque.
19. As a Guardian, I want old history retained for future relevance without sending it all to a provider each time, so that personalization remains private and focused.
20. As a subscriber, I want a clear shared monthly allowance, so that I know how many completed Storybooks remain.
21. As a subscriber, I want failed generation attempts refunded to the allowance, so that provider failures do not consume value.
22. As the business owner, I want each provider attempt attributed to a Family, Persona, Storybook, Page, endpoint, model, and price version, so that cost and failures are auditable.
23. As the business owner, I want a kill switch when cost or failure rates exceed thresholds, so that provider drift cannot silently destroy margins.
24. As the business owner, I want typical post-platform delivery margin of 75–80% and approximately 70% at the plan cap, so that the subscription can support the rest of the company.
25. As a Guardian, I want Hard-delete to erase photos, LoRAs, context, Storybooks, and provider-derived artifacts, so that cancellation and deletion are complete.
26. As a Guardian, I want my Family data isolated by database RLS, so that another Family can never access it.

## Implementation Decisions

### Product and entitlement

- R1 has one creating Guardian Member and no invitations. Collaboration code remains disabled behind release configuration.
- A Family may contain multiple babies and adults. The included trained-Persona cap is three total, independent of Persona kind.
- Just Us is `$14.99/month` or `$119.99/year`, annual selected by default, with four completed Storybooks per monthly reset.
- Up to three Personas may star in one R1 Storybook and one Page. The Story allowance is account-level and never multiplies by Persona count.
- A Story allowance is reserved at enqueue, committed when Story text reaches a valid draft, and released if text generation fails. Page repair does not consume another Story allowance.
- These economics are release-gated by the provider canary. If acceptable FLUX.2 likeness requires more than 500 steps or the full-cap annual delivery margin falls below 70%, release is blocked pending an explicit price, cap, Persona, or routing decision.

### Family, consent, and persistence

- Family/Person/Baby/Persona relationship creation is one atomic use case; partial roster or bond state is not allowed.
- Child-age, consent method, and residency remain jurisdiction configuration, never literals.
- Baby Persona creation requires a verified Consent receipt. Adult Persona creation requires self-consent.
- Source photos are moderated before durable persistence and before training submission.
- Raw photos never appear on ordinary client-facing roster surfaces; generated Roster avatars are returned instead.
- Consent method and all lifecycle statuses must round-trip through the production schema, and Family-owned tables must enforce RLS.

### LoRA lifecycle and provider ownership

- Keep one LoRA per Persona.
- The target trainer is `fal-ai/flux-2-trainer-v2`; input is a backend-created ZIP URL containing moderated images and captions/default caption.
- Provider work is submitted through supported queue APIs. Provider request IDs are durable and idempotency keys prevent duplicate training or generation spend.
- Webhooks are accepted only after timestamp, body-hash, and signature verification against provider keys. Duplicate, stale, malformed, and out-of-order callbacks are safe.
- Provider output URLs are temporary inputs. LoRA weights and configuration are copied into Family-owned storage before a Persona can advance to review.
- Training completion produces review samples; it does not make a Persona Story-ready. Explicit Likeness confirmation is required.
- Development fakes may remain available only behind explicit local configuration and may never count as release evidence.

### Story Context and text generation

- Retain the current deterministic selector seam and approximately 2,000-token initial budget from ADR-0022.
- The authorized lifetime corpus includes protected cast/relationships, Significant Moments, ordinary Moments after the watermark, age/Firsts, write-only photo descriptions, and bounded past-Story summaries.
- The complete corpus remains available for future selection, but only relevant bounded text is disclosed per Prompt. Raw images are never sent as Story Context.
- Keep Anthropic structured outputs. Sonnet 4.6 remains the immediate production model until Sonnet 5 wins a golden-set evaluation on warmth, read-aloud quality, personalization, safety, schema/semantic validity, latency, and cost.
- Raise the Story output safety ceiling to 24K–32K only with retained `stop_reason` and usage checks; unused capacity is not treated as spend.
- Validate exactly twelve Pages and Scenes, sequential indexes, selected Persona IDs only, and complete Style Bible content before illustration spend.

### Illustration and recovery

- Target default inference is `fal-ai/flux-2/lora` at approximately 1 MP per Page, with no more than three LoRAs.
- FLUX.1 LoRA remains the lower-training-cost challenger; no adapter family is switched without canary evidence.
- Generate the twelve Pages as bounded concurrent jobs rather than sequential calls.
- One to three Personas are composed in a single multi-LoRA call. Fake face labels are not masks and must not be used as inpainting coordinates.
- A failed Page remains a re-rollable hole. Bounded repair may use Nano Banana 2 Edit, escalating an individual hard Page to Nano Banana Pro Edit. Repair never silently becomes the default for all Pages.
- Keep provider safety enabled and run application moderation on generated images.

### Cost controls and observability

- Planning cost for a successful FLUX.2 Storybook is approximately `$0.45`; initial operating reserve is 15–25%.
- Meter text tokens, image megapixels/images, training steps, moderation operations, storage/egress, queue work, retries, failures, and repair routing.
- Green cost variance is within ±5% of budget; amber is 5–10%; red is greater than 10% or a P95 full-cap margin below 70%.
- Model IDs, endpoint IDs, pricing versions, latency, provider request IDs, and terminal outcomes are retained without credentials or raw photo content.
- Provider failures remain visible and terminal. No fallback may transform an unavailable provider into apparent production success.

## Invariants

- **FAM-1:** R1 solo means one creating Guardian Member, not one Family person or one Baby.
- **FAM-2:** The three-Persona cap is total and type-neutral; Story allowance is shared.
- **SAFE-1:** No Baby photo is durably persisted or submitted before verified consent and moderation.
- **SAFE-2:** No Adult Persona is trained without self-consent.
- **SAFE-3:** Raw source photos are never returned by ordinary roster APIs or UI.
- **PROV-1:** Release evidence must use real Anthropic and fal.ai responses; fake success is development-only.
- **PROV-2:** Signed callbacks, idempotency, and Family-owned LoRA artifacts are mandatory.
- **LIKE-1:** Training completion is not Likeness confirmation and cannot unlock Story spend.
- **CTX-1:** Lifetime personalization is bounded deterministic retrieval, never an unbounded transcript.
- **CTX-2:** Story Context never crosses Family or Baby boundaries and is purged by Hard-delete.
- **STORY-1:** Valid Story text precedes illustration spend and contains exactly twelve Pages/Scenes.
- **IMG-1:** One to three starring Personas use one multi-LoRA Page call; twelve Pages fan out concurrently.
- **FAIL-1:** A failed Page is recoverable; failed Story text releases the Story allowance.
- **COST-1:** Typical delivery margin targets 75–80%; annual full-cap margin must be approximately 70% or release stops.
- **DEL-1:** Hard-delete removes database rows, raw photos, generated derivatives, LoRA weights, context artifacts, and provider-owned copies where the contract permits.
- **RLS-1:** Database RLS, not application checks alone, enforces Family isolation.

## Testing Decisions

- Test at the highest stable use-case seam: one authorized request should prove entitlement, Family isolation, persistence, workflow dispatch, and externally visible state.
- Use deterministic provider fakes for CI contract tests, but make fixtures byte-for-byte representative of current queue submissions, signed success/failure webhooks, duplicates, stale callbacks, malformed results, and provider output shapes.
- Add database integration tests proving two Families cannot read or mutate each other’s Babies, bonds, Personas, Consent receipts, Story Context, Storybooks, or provider artifacts.
- Add Hard-delete integration coverage that inventories every owned key before deletion and proves no owned row/blob remains afterward.
- Add semantic Story tests in addition to JSON-schema validation.
- Add concurrency tests proving Page fan-out, bounded workers, watchdog behavior, terminal Storybook status, and deterministic retry limits.
- Keep paid smoke tests out of deterministic CI. They require explicit credentials, a hard budget environment variable, synthetic/consenting-adult fixtures, and produce a cost/latency/quality report.
- Final release verification is a production-like native flow using real providers: trial → consent → add multiple Family people/babies → train → review/accept likeness → Brief → context-selected Story → twelve illustrated Pages → cost evidence → Hard-delete/isolation evidence.
- Project-wide verification remains `npm run verify`; each implementation ticket adds a focused command that must pass first.

## Out of Scope

- Family invitations, additional creating Members, and collaborative Family access.
- Audio, narration, voice cloning, and video Pages.
- More than three starring Personas in one Storybook/Page.
- Unlimited Stories, unlimited rollover, or a per-Persona Story allowance.
- Automatic paid overage or a second visible R1 plan.
- Embeddings/vector retrieval or an LLM ranking pre-pass for Story Context.
- Default 2K/4K generation or print-quality rendering; included generation is screen-first near 1 MP.
- Production deployment, App Store submission, or merging the planning PR.
- Real minor photos in engineering canaries.

## Further Notes

- This PRD supersedes the R1 one-Baby restriction and the Just Us price/cap row from ADR-0025; it does not activate invitations or the deferred Our Whole Family plan.
- Official provider research was captured from fal.ai, Anthropic, Apple, RevenueCat, Stripe, and public consumer-app comparators on 2026-07-20. Provider prices are live values and must be versioned in metering.
- Current deterministic verification is green, but live provider readiness remains unproven until the budget-gated canary and final release smoke complete.
- Parent wayfinding issues: real provider pipeline `#136`; cost/margin research `#138`.
