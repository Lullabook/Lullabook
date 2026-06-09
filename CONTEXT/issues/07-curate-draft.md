# 07 — Curate draft: per-Page re-roll, candidates, finalize

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0004, ADR-0009

## What to build

A Member curates a draft Storybook: re-roll a single Page's illustration or its
text **independently**, with each re-roll producing a new candidate the Member
can select among. Re-rolls are bounded by a per-Storybook re-roll budget (free,
then credit-metered); the Member can buy extra re-rolls. When satisfied, the
Member finalizes the Storybook (`draft → finalized`). Drafts are private to the
creating Member.

## Acceptance criteria

- [ ] Re-rolling a Page's image creates a new image candidate without changing its text; selectable.
- [ ] Re-rolling/editing a Page's text is independent of its image.
- [ ] Re-roll budget decrements; beyond the free budget, extra re-rolls require credits.
- [ ] Finalize transitions the Storybook to `finalized`.
- [ ] A draft is not visible to other Family Members until finalized.

## Blocked by

- 06 — Generate Storybook (single-persona)
