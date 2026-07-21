# 90 — Past-Story continuity summary (anti-repeat input)

Status: shipped; reactivated for the accepted R1 flow by ticket 181 / GitHub #155

Shipped (commit `4a88074`) as the bounded per-Baby rolling summary (protagonist beats,
theme, named entities) written on Storybook finalization, capped to a newest-N window,
fed to the context engine (89) as an anti-repeat instruction; empty when no prior Stories
(no error). Family-scoped, no raw photo data, purged by hard-delete (ADR-0007).
Previously deferred alongside the context engine by issue 148. PRD v21 restores this bounded
continuity/anti-repeat input to R1 through ticket 181; the existing isolation and Hard-delete
contract remains binding.

(condensed 2026-07-07 — full spec in git history)
