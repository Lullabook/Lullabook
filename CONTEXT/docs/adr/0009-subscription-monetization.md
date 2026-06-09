# 0009 — Subscription monetization, metered on Personas

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0002](0002-per-persona-lora.md), [ADR-0004](0004-curated-versioned-storybook.md)

## Context

Lullabook has two structurally different cost drivers: Persona creation (LoRA
training — a large, one-time GPU cost per Persona) and Storybook generation
(per-book LLM + per-page image inference + re-rolls). Unlike typical SaaS, every
unit of use costs real money, so an unmetered subscription is a margin risk.

## Decision

Monetize via a **subscription**, shaped as a **metered hybrid**:

- **Personas are the tier lever** — each tier caps the number of Personas; higher
  tiers allow more. This puts the price knob directly on the dominant cost.
- **Storybooks are unlimited under fair use** — no marketed cap, but a soft
  anti-abuse ceiling plus the enforced per-book **re-roll budget**
  ([ADR-0004](0004-curated-versioned-storybook.md)) keep "unlimited" from meaning
  uncapped compute. Extra re-rolls are credit-metered.

## Consequences

- Margin is protected primarily by the Persona cap (biggest cost) and the
  re-roll budget (where image cost explodes), not by limiting books.
- The paid subscription also serves as the verifiable-parental-consent mechanism
  ([ADR-0008](0008-verifiable-parental-consent.md)) — there is no free tier that
  touches a child's photos.
- Recurring revenue comes with churn risk: keepsake creation is bursty
  (birthdays, holidays, new siblings), so retention must be actively designed
  (e.g. occasion prompts, new themes). Accepted as a deliberate bet over
  pay-per-use.

## Considered Options

- **Pay-per-use (one-time Persona fee + per-Storybook fee)** — mirrors costs and
  fits bursty buying; rejected in favor of recurring revenue.
- **Unlimited subscription** — simplest to market; rejected as a margin
  time-bomb given real per-use compute cost.
