# PRD v2 — Productionized generation pipeline + Character (free text) tier + Personalized Classics

Status: shipped — foundational architecture, still in force.

Still-binding rules:
- Generation runs as a **durable workflow** (thin request, fat workflow); Storybook
  starts `generating`, flips to `draft` once every Page is terminal, `failed` if the
  text pass fails or too few Pages succeed.
- One structured Claude pass yields Story + per-Page Scenes + Style Bible; per-Page
  Prompt = Style Bible + Scene + Persona LoRA(s).
- **Moderate bytes before any persist** (never store an unmoderated image); CSAM
  positive escalates to HITL/NCMEC, not a soft quarantine.
- Per-Page steps use **deterministic idempotent keys** (no `uuid()`/`Date.now()` inside
  the workflow) so replay never double-bills fal.ai or duplicates Pages.
- System-caused recovery regeneration is free; only a parent-initiated re-roll spends budget.
- **Character** (free, text-only, no photo/LoRA/biometric) via Trait Questionnaire;
  promotable to a Persona later. **Personalized Classics** = curated public-domain
  catalog only, recast with the family's Personas through the same pipeline.

(condensed 2026-07-07 — full text in git history)
