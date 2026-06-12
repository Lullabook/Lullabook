# 22 — Personalized Classics (public-domain catalog)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0017, ADR-0012, ADR-0010, ADR-0004
- Glossary: Personalized Classic, Story Type, Persona, Style Bible, Scene

## What to build

Let a parent pick a beloved tale from a curated **public-domain** catalog and
have their **Personas** recast as its characters, producing an illustrated
Storybook that reuses the **entire** productionized generation workflow (Scenes,
Style Bible, fan-out, moderate-before-store, blob keys, per-Page isolation,
idempotency). The only new pieces are a **`ClassicCatalog`** port that serves
confirmed public-domain source tales (no arbitrary "famous story" input) and an
`AnthropicAdapter.adaptStory(...)` contract that recasts the source's plot beats
onto the starring Personas, honoring the chosen Story Type where it makes sense.
Any custom twist the parent adds passes the same moderation rails as a Brief.

**Non-code dependency:** the catalog must be sourced and legally confirmed
public-domain before this slice can ship (track separately; ADR-0017).

## Acceptance criteria

- [ ] A parent can select a catalog tale and generate a Personalized Classic starring their Personas.
- [ ] `generateFromClassic` reuses the productionized workflow body (Style Bible, fan-out, moderation-before-store, blob keys, isolation, idempotency) — no parallel pipeline.
- [ ] Only catalog (public-domain) ids are accepted; arbitrary titles are rejected.
- [ ] A custom twist is moderated like a Brief before generation.
- [ ] The chosen Story Type shapes the adaptation where applicable.
- [ ] Tested at the service seam with `ClassicCatalog` + Anthropic (`adaptStory`) + fal.ai faked; reuses the slice-15/16 isolation + idempotency guarantees.

## Blocked by

- 15 — Durable generation spine (single-Persona, real seams)
