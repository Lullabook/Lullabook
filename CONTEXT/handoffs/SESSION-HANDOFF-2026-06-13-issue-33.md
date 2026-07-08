# Session Handoff — 2026-06-13 (issue 33): Email-Plus VPC revoke withdraws consent

Status: historical

Completed issue 33 test-first (132 tests green), finishing all PRD v4 work
(issues 32–33): hardened `EmailPlusVpcService.revokeConsent` and added
`POST /api/consent/email-plus/revoke`.

- Binding: revoke is rejected before confirmation or when already revoked; on success sets `status = revoked` and clears the Consent receipt (`consent_verified`); the audit row is retained.
- Binding: when Baby Personas exist, revoke schedules the existing 30-day purge window (ADR-0007) — no new auto-delete pipeline; consent-only Families just get consent cleared.
- Binding: Guardian may still invoke immediate hard-delete at any time (ADR-0007); confirm tokens are single-use.

(condensed 2026-07-07 — full text in git history)
