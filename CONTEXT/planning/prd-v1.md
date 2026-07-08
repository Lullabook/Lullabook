# PRD — Lullabook v1 (Text + Illustration Storybook)

Status: superseded. Domain model (Family/Persona) superseded by PRD v5
(Household/Baby/World/Family-roster/Character); platform (web) superseded by
PRD v3 (native iOS).

Still-binding groundwork later ADRs build on:
- Photo-conditioned per-persona LoRA likeness; Style Bible for illustration consistency.
- Verifiable parental consent gates Baby Persona creation; consent receipts recorded.
- CSAM hash-match + safety classifier on uploads; every generated image moderated
  before storage — **moderation fails closed**.
- Hard-delete must provably erase data across DB, blob storage, caches/backups.
- Free re-roll budget per book; overage credit-metered.
- Jurisdiction-aware consent engine: age threshold/method/residency are config, never hardcoded.

(condensed 2026-07-07 — full text in git history)
