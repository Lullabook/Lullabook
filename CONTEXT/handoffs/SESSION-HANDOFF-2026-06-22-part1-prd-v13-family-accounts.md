# Session Handoff — 2026-06-22: /part1 → PRD v13 (working app + family accounts + 2-plan pricing)

Status: historical

Planning-only session. Produced ADR-0024 (family accounts/invitations), ADR-0025
(two-plan monetization, supersedes ADR-0023), PRD v13, issues 100–121, and CONTEXT
glossary v13 section. All 22 issues were subsequently built (see the 06-23 track handoffs).

- Entitlement / plan / login-cap / create-rights are server-authoritative; all dev-only
  paths (seed, liveness bypass, `DEV_FORCE_SUBSCRIPTION`) double-gated and inert in prod.
- Invite tokens single-use + expiring; Guardian-only invite/remove/baby-persona/hard-delete;
  invited Member never gains Guardian powers; cross-member RLS isolation.
- Apple IAP entitlement is Household-level (inherited on login), never per-seat.
- Cap/credit exhaustion is never a dead end; failed metered actions refund; idempotent.

(condensed 2026-07-07 — full text in git history)
