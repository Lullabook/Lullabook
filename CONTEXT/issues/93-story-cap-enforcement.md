# 93 — Story-cap & member-cap enforcement (server-side, monthly reset)

Status: superseded by 118-enforce-monthly-story-cap.md

Shipped server-side, idempotent enforcement of the (then 3-tier) monthly Story cap
(4/8/20) and Family-member cap (2/4/∞): over-cap generation rejected with a structured
limit state (count, reset date, upgrade CTA), never a 500; a failed generation never
consumes a slot; replay-safe (ties to ADR-0011/issue 16).
Superseded when the tier model collapsed to two plans (116) — issue 118 found
`requireUnderCap` wasn't actually wired into the generate path and fixed the wiring for
the new caps (8/20) as a single shared per-Household pool.

(condensed 2026-07-07 — full spec in git history)
