# 109 — Invite token model + email send
Status: cut
Built invite domain extension: opaque single-use token, expiry, fixed role (member), status on the invites table; FamilyService.inviteMember minted the token and sent the email via Resend. Guardian-only invite; role not attacker-choosable.
Cut for R1 — 146 (solo Guardian, one baby) disables family-invite endpoints server-side (clean 404/403).
(condensed 2026-07-07 — full spec in git history)
