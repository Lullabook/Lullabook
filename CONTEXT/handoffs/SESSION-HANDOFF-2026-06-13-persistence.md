# Session Handoff — 2026-06-13 (persistence): PRD v4 + issues 32–33

Status: historical

Planning-only session: produced `CONTEXT/planning/prd-v4-production-persistence.md`
and issues 32 (persist `push_subscriptions` + `email_plus_vpc_requests`, migration
003, CI migration smoke-check) and 33 (Email-Plus VPC revoke withdraws consent).
Also created the global `/planner` and `/coder` orchestrator skills.

- Binding: test strategy — keep fast in-memory simulated-RLS tests + CI migration smoke-check (apply `001`→`003` to throwaway Postgres); real-Postgres RLS harness deferred.
- Binding: `push_subscriptions` is member-scoped (no `family_id`); `email_plus_vpc_requests` is Family-scoped + Guardian-managed, secret `token` resolved server-side only.
- Binding: VPC request rows persist as audit; confirm token is single-use; revoke is always available, clears Family `consent_verified`, blocks new Baby Persona, and routes child data to the existing ADR-0007 purge path; both tables erased on Family hard-delete.

(condensed 2026-07-07 — full text in git history)
