# 33 — Email-Plus VPC revoke withdraws consent

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v4 — Production persistence](../planning/prd-v4-production-persistence.md)
- Implementer: Cursor Composer 2.5 / Antigravity, TDD

## What to build

Make the Email-Plus VPC consent state machine honor a Guardian's right to
**withdraw** consent at any time (COPPA), on top of the now-durable
`email_plus_vpc_requests` table. The request row persists permanently as the
consent audit record (paired with the version-stamped Consent receipt); the
confirm token is single-use; the revoke link stays available after confirmation.

Revoking sets `status = revoked`, clears the Family's `consent_verified`, which
**blocks new Baby Persona creation** (the consent engine already gates on it), and
routes the child's existing data to the **existing** hard-delete/purge path
(ADR-0007) — no new auto-purge pipeline is built here.

## Acceptance criteria

- [ ] The **confirm** token is single-use: a second confirm attempt is rejected.
- [ ] The consent request row persists after confirmation (audit), erased only on
      Family hard-delete.
- [ ] A Guardian can **revoke** consent after confirmation at any time; revoke sets
      `status = revoked` and clears the Family's `consent_verified`.
- [ ] After revoke, the consent engine **blocks** new Baby Persona creation where
      `email_plus` is the required method (faked Jurisdiction config).
- [ ] Revoke routes the child's existing data to the existing purge path
      (ADR-0007); this issue does **not** add a new automatic cascade.
- [ ] Tested at the VPC service / consent-engine seam with adapters faked; prior
      art `02-subscription-consent`, `03-adult-persona`, `12-hard-delete`.
- [ ] All existing tests stay green; `npx tsc --noEmit` + lint clean.

## Blocked by

- [32 — Persist push_subscriptions + email_plus_vpc_requests](./32-persist-push-and-vpc-tables.md)
