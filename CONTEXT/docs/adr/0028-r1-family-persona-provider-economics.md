# 0028 — R1 multi-Persona Family, provider routing, and margin gate

- Status: Accepted (2026-07-20)
- Supersedes for R1 only: ADR-0025’s Just Us price, Story cap, and Persona assumptions; issue 146’s one-Baby restriction.
- Retains: ADR-0025’s collaboration-axis design for a later release, server-authoritative entitlement, and shared Family allowance.
- Depends on: ADR-0001, ADR-0002, ADR-0005, ADR-0006, ADR-0007, ADR-0008, ADR-0010, ADR-0011, ADR-0012, ADR-0014, ADR-0020, ADR-0022, ADR-0024, ADR-0027.

## Context

R1 “solo” was implemented as a solo Guardian plus one Baby. The intended product is one Guardian account without invitations, but with multiple real Family people and babies up to the plan’s likeness limit. The current deterministic suite does not prove the real fal.ai path: training submission, callback authentication, artifact ownership, native Likeness confirmation, multi-Persona composition, and Page concurrency contain confirmed gaps.

The accepted `$9.99/month` / `$79.99/year`, eight-Story Just Us row was based on older FLUX.1 estimates and assumed breakage. Current bottom-up economics include Apple, RevenueCat, refunds, twelve Pages, Claude, moderation, retry/storage reserve, and per-Persona LoRA training. At full annual usage the old row does not preserve a healthy delivery margin.

## Decision

### R1 Family and plan

- R1 has one creating Guardian Member and no invitations.
- A Family may contain multiple Adult and Baby Personas; the included cap is three trained Personas total, regardless of kind.
- Up to three Personas may star in one R1 Storybook and one Page.
- Just Us is `$14.99/month` or `$119.99/year`, annual preselected, with four completed 12-Page Storybooks per monthly reset.
- The Story allowance is shared by the Family and never multiplied by Persona count.
- Failed Story text releases a reserved allowance; Page recovery does not consume another Storybook.

### Provider and model gate

- `fal-ai/flux-2/lora` with `fal-ai/flux-2-trainer-v2` is the target default, not a release fact.
- A hard-capped `$10` canary using synthetic subjects or consenting adults must compare FLUX.1/FLUX.2 likeness, one/two-Persona composition, selective reference-edit repair, latency, failure behavior, and actual cost.
- FLUX.2 is approved for production only if acceptable likeness is achieved at no more than 500 steps and multi-Persona quality passes. Otherwise pricing, caps, Persona count, or routing return to decision.
- One to three Personas are composed in a single multi-LoRA inference call. Twelve Pages run as bounded concurrent jobs.
- Nano Banana 2 Edit and then Nano Banana Pro Edit are selective Page-repair routes, not default book generators.
- Claude Sonnet 4.6 remains immediate production text generation. Sonnet 5 may replace it only after a fixed golden-set evaluation.

### Lifetime context

- The complete authorized Family history remains eligible for future relevance.
- Each Prompt receives a bounded deterministic Story Context set, initially approximately 2,000 tokens, under ADR-0022.
- Raw images never enter Story Context. Family/Baby isolation, provenance, consent, retention, and Hard-delete apply to every context artifact.

### Margin and metering gate

- Target post-platform delivery margin is 75–80% for typical usage and approximately 70% at the annual full-cap/P95 case.
- Initial direct-cost reserve is 15–25% until production cohorts stabilize.
- Green unit-cost variance is ±5% of budget, amber is 5–10%, and red is greater than 10% or full-cap/P95 margin below 70%.
- Every text, image, training, moderation, storage, queue, retry, and repair attempt is attributed to model/endpoint/pricing version and the owning Family/Persona/Storybook/Page without credentials or raw image contents.
- Fake provider completion is development-only and cannot satisfy a release gate.

## Consequences

- The one-Baby R1 cut is removed without enabling invitations or additional Member logins.
- Paywall, entitlement, Story cap, Family creation, and mobile copy must converge on one server-authoritative plan definition.
- Consent and moderation must occur before source-photo persistence and provider submission.
- Provider outputs must be copied into Family-owned storage; signed callbacks and idempotency are mandatory.
- Training completion remains separate from Likeness confirmation.
- The native app must expose review/accept/retrain and resume any waiting Brief only after acceptance.
- RLS and Hard-delete tests expand to Babies, bonds, Consent receipts, Story Context, provider requests, generated derivatives, and LoRA artifacts.
- The accepted price/cap is blocked from release if the canary requires 1,000-step FLUX.2 training: modeled annual full-cap margin would fall materially below the gate.

## Considered Options

- **Keep `$9.99/$79.99` and eight Stories.** Rejected: unsafe full-cap annual economics.
- **Keep `$9.99` but reduce annual discount and cap.** Viable budget alternative at `$9.99/$99.99`, three Stories, three Personas; not selected because the product goal is a weekly Story habit.
- **Unlimited or breakage-funded Stories.** Rejected: heavy users must remain profitable without relying on unused allowance.
- **Reference-only generation for every Page.** Rejected as the default because it abandons the accepted per-Persona LoRA architecture and repeatedly discloses references; retained as selective repair.
- **Send lifetime raw history to a 1M-context model.** Rejected: bounded relevant disclosure is safer, faster, cheaper, and more testable.
- **Use the cheapest text model automatically.** Rejected: a few cents saved does not offset weaker Story quality, invalid structure, or retries.
