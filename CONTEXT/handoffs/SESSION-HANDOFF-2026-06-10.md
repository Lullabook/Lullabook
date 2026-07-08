# Lullabook — Session Handoff (2026-06-10)

Status: historical

Planning session (grill-with-docs → to-prd → to-issues): produced PRD v2
(generation-pipeline productionization), issues 15–22 (durable spine, idempotency,
multi-Persona spike/prod, free text-only Character tier, Character→Persona upgrade,
Personalized Classics), ADRs 0016–0017, and glossary additions.

- Binding: Storybook lifecycle is `generating → (draft | failed) → finalized`; flip at all-terminal; `failed` has a ready-Page floor; system recovery free, parent re-roll budgeted.
- Binding: image path = fetch → moderate bytes BEFORE any persist → blob store; Pages store our blob keys, never provider URLs; CSAM-positive escalates (HITL/NCMEC), never soft quarantine.
- Binding: deterministic idempotency keys inside workflows (no uuid/Date.now); thin request, fat workflow (ADR-0011).
- Binding: illustrated `generate()` requires active subscription + ready Persona + budget; text-only Character tier is free and not sub-gated; two-tier consent (ADR-0016) — light notice for Characters, full biometric gate for Personas.
- Binding: Classics are public-domain catalog only (ADR-0017).

(condensed 2026-07-07 — full text in git history)
