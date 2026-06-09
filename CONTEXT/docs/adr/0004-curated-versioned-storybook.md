# 0004 — Storybook is a curated, versioned draft (not a one-shot)

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0001](0001-photo-conditioned-likeness.md), [ADR-0002](0002-per-persona-lora.md)

## Context

Illustration conditioned on a real specific child's face (ADR-0001/0002) will
inevitably produce some off pages — uncanny expressions, wrong details, a scene
that mismatches the text. In a paid keepsake about someone's baby, an off page
breaks the emotional hook and drives refunds. "Generate once, take what you get"
is therefore not viable.

## Decision

A Storybook is an **editable, curated draft** with a **`generating → draft →
finalized`** lifecycle. Generation produces a full draft; the parent reviews and
**regenerates individual Pages**, with **text and illustration regenerated
independently**. Each Page holds multiple **candidates** (versioning); the parent
selects which candidate the Page shows. Only a **finalized** Storybook is
shareable/purchasable.

## Consequences

- **Positive:** Parents can salvage a mostly-good book by fixing the one bad
  page, instead of re-rolling (and re-paying for) the whole thing.
- **Negative / load-bearing:**
  - Data model must support per-Page candidate versioning and a Storybook
    lifecycle state — more than a flat list of pages.
  - Regeneration must be **bounded by a re-roll budget** (free re-rolls, then
    credit-metered) to protect unit economics from unlimited re-rolls.
  - A "finalize" step is required before share/purchase.

## Considered Options

- **One-shot, no editing** — cheapest; rejected as unshippable for a paid
  keepsake.
- **One-shot, regenerate whole book** — simpler model; rejected because it
  can't keep the good pages and multiplies cost per acceptable book.
