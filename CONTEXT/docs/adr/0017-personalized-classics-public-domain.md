# 0017 — Personalized Classics restricted to a curated public-domain catalog

- Status: Accepted
- Date: 2026-06-10
- Depends on: [ADR-0010](0010-child-safety-defense-in-depth.md), [ADR-0012](0012-illustration-pipeline-style-bible.md)

## Context

Beyond original Stories generated from a Brief, parents want **Personalized
Classics** — an existing tale recast with the family's Personas as its characters
("*Alice in Wonderland* starring grandma"). This is a strong hook: a recognizable
story is something a parent can anticipate, unlike a from-scratch narrative they
can't preview. But "famous stories" are mostly **in copyright** (modern picture
books, franchise characters). Generating derivative works from them — and
illustrating them with a real child's likeness — stacks a copyright-infringement
surface on top of the minor-likeness obligations the product already carries.

## Decision

- Personalized Classics are restricted to a **curated catalog of public-domain
  source tales**. No arbitrary "enter any famous story" input.
- The generation contract differs from original Stories: **adapt-and-recast**
  (preserve the source's plot beats, swap characters → Personas, re-style to the
  chosen Story Type) rather than invent. It otherwise reuses the full pipeline —
  Scenes, Style Bible (ADR-0012), Pages, per-page failure isolation.
- Any free-text the parent adds (a custom twist) passes the **same moderation
  rails as a Brief** (ADR-0010).
- Personalized Classics is **v1 scope but its own build slice**, layered on the
  core generate path rather than bolted into it.

## Consequences

- A curated catalog is content/legal work (sourcing confirmed public-domain
  texts, light editorial normalization) — a gating cost before the feature ships,
  but it caps copyright exposure to a known, reviewed set.
- Parents cannot request an arbitrary copyrighted title; the value proposition is
  "personalize *these* beloved classics," not "personalize anything."

## Considered Options

- **Allow any user-named story** — maximal appeal, unbounded copyright and
  moderation exposure layered on minors' likeness. Rejected.
- **No classics in v1** — safest, but forfeits a strong, low-risk hook that
  reuses the existing pipeline. Rejected in favor of the public-domain-only
  catalog.

## Revisit if

- A licensing arrangement makes specific in-copyright titles available for a
  premium tier (mirrors the ADR-0012 reference-image revisit).
