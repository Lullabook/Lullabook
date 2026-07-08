# 91 — Tier & entitlement model (ADR-0023)

Status: superseded by 116-two-plan-entitlement-model.md

Shipped (commit `8870a2c`) the original 3-tier server-side entitlement source of truth:
Basic/Normal/Plus with per-tier Story caps (4/8/20), Family-member caps (2/4/∞), and
capability flags (narration/video/custom-style), enforced via a single server 403
boundary (client UI is never the gate). `DEV_FORCE_SUBSCRIPTION` established as
dev-only, never-ship.
Replaced by the two-plan model (Just Us / Our Whole Family, ADR-0025) in issue 116; the
403-boundary and dev-override invariants carried forward unchanged.

(condensed 2026-07-07 — full spec in git history)
