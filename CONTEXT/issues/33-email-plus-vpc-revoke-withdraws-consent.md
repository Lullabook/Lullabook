# 33 — Email-Plus VPC revoke withdraws consent

Status: shipped

Binding COPPA invariant still in effect: the confirm token is single-use; the request row persists permanently as the audit record (erased only on Family hard-delete); a Guardian can revoke consent at any time, which sets `status = revoked`, clears `consent_verified`, and blocks new Baby Persona creation; revoke routes existing child data to the existing hard-delete/purge path (ADR-0007) — no separate auto-purge pipeline exists.

(condensed 2026-07-07 — full spec in git history)
