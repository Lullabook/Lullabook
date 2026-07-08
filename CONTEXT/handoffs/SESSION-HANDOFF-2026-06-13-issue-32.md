# Session Handoff — 2026-06-13 (issue 32): persist push + Email-Plus VPC tables

Status: historical

Completed issue 32 (127 tests green): migration
`003_push_and_email_plus_vpc.sql`, `SupabaseDataStore` hydrate/sync for
`push_subscriptions` and `email_plus_vpc_requests`, simulated-RLS read paths,
hard-delete propagation, and the CI migration smoke-check
(`tools/migration-smoke.sh`, Postgres 16 job applying `001`→`003`).

- Binding: `push_subscriptions` RLS is member-scoped (`member_id = app_current_member_id()`); `email_plus_vpc_requests` is Family-scoped select, Guardian insert/update.
- Binding: client reads use `getEmailPlusVpcRequestsForFamily`, which omits the secret `token`; confirm/revoke run service-role server-side only.
- Binding: `sync()` deletes run before members (FK order); hard-delete must not re-upsert on a second `sync()`.

(condensed 2026-07-07 — full text in git history)
