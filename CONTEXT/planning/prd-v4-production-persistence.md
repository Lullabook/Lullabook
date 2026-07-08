# PRD v4 — Production persistence for `push_subscriptions` + `email_plus_vpc_requests`

Status: shipped (migration `003`).

Still-binding rules:
- Both tables are RLS-protected: `push_subscriptions` scoped by `member_id` (a Member
  manages only their own device tokens); `email_plus_vpc_requests` visible within the
  Family, Guardian-only writes; the consent/revoke **token** is resolved only
  server-side (service role), never via a client RLS read.
- **Hard-delete must erase both tables** for a Family (push tokens via the members
  subquery, since they carry no `family_id`) — and `sync()` must never re-upsert a
  deleted row.
- Consent **confirm** is single-use (token consumed); **revoke** stays available
  indefinitely after confirmation and clears `consent_verified`, blocking new Baby
  Persona creation and routing existing child data to the standard purge path.
- The VPC request row persists permanently as the consent audit record, erased only
  on Family hard-delete.

(condensed 2026-07-07 — full text in git history)
