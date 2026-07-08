# 110 — Invite acceptance route + onboarding-collision fix + Self-Persona link
Status: cut
Built accept-invite route: consumes token, creates Member(role: member) in the inviter's Household, links Self Persona, takes precedence over ensureFamilyForNewUser auto-onboarding. Rejected expired/used/forged tokens; cross-family read threw RlsViolationError.
Cut for R1 — 146 disables invited-member endpoints server-side (multi-family collapsed to solo Guardian only).
(condensed 2026-07-07 — full spec in git history)
