# 06 — Generate Storybook (single-persona, end-to-end)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0004, ADR-0012, ADR-0002

## What to build

From a Brief (starring one ready Persona + one curated theme + optional note),
generate a full draft Storybook: one structured Claude pass yields Story text +
per-Page Scene specs + a per-book Style Bible; the durable workflow fans out N
per-Page image generations (single-LoRA via fal.ai adapter), each composed as
`Style Bible + Scene + LoRA`. Storybook transitions `generating → draft`. A
single Page's failed generation/moderation is isolated (retry/quarantine) while
other Pages proceed.

## Acceptance criteria

- [ ] A Brief produces a draft Storybook with ~12 Pages, each pairing text with an illustration.
- [ ] The structured generation yields Story + Scenes + Style Bible in one pass.
- [ ] Per-Page image prompts incorporate the Style Bible (consistency).
- [ ] One faked image failure quarantines that Page; the rest of the book still completes (per-step isolation test).
- [ ] `StorybookService.generate(brief)` tested at the service seam with Anthropic + fal.ai faked.

## Blocked by

- 03 — Adult Persona creation
