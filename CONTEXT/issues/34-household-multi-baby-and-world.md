# 34 — Household + multiple babies + per-baby World

Status: superseded by 146-cut-multi-family-solo-only.md

Introduced Household as the account/billing/consent boundary (reframing `Family`) with a `babies` table and per-baby World surface; `family_id` kept working via a compat shim. The Household/World naming and account-boundary model is foundational and persisted, but the multiple-babies capability itself was cut for R1 (146: one baby per Household, enforced server-side) — multi-baby code stays behind config for R2.

(condensed 2026-07-07 — full spec in git history)
