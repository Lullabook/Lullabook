# 0012 — Illustration pipeline: per-book Style Bible for visual consistency

- Status: Accepted
- Date: 2026-06-09
- Depends on: [ADR-0002](0002-per-persona-lora.md), [ADR-0010](0010-child-safety-defense-in-depth.md)

## Context

A persona LoRA fixes *facial* likeness but not **cross-page visual continuity**:
wardrobe, art style, lighting, recurring settings. Prompting each page
independently produces the classic "incoherent AI picture book" where details
drift page to page — a keepsake-quality killer.

## Decision

- In **one structured-output pass**, Claude produces the Story text, an array of
  per-page **Scene** specs (setting, action, Personas present), **and** a
  book-level **Style Bible** — the visual constants every page must respect
  (per-Persona wardrobe/appearance, recurring settings, palette, time-of-day,
  art style).
- Each page's image **Prompt** = `Style Bible + that page's Scene + relevant
  Persona LoRA(s)`.
- **Art style is a curated, quality-tuned menu**, chosen per book. A parent may
  optionally layer a short **custom style text note** (moderated like the Brief,
  flagged experimental). **No reference-image style uploads in v1** (copyright +
  added moderation surface).

## Consequences

- The data model stores per-book continuity constants (the Style Bible), not just
  page text — more than a flat list of pages.
- Custom style notes pass through the same moderation pipeline as the Brief
  (ADR-0010); they are not individually quality-tuned, hence "experimental".

## Revisit if

- Reference-image style transfer becomes worth the copyright/safety work for a
  premium tier.
