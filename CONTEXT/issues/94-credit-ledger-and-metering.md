# 94 — Credit ledger + metering for video & custom-style overage

Status: shipped

Shipped the per-Household credit ledger metering video pages (Plus: 2 included/mo),
custom-style trainings (Plus: 1/mo), and re-roll overage (ADR-0004): atomic
server-authoritative debits, included-before-purchased ordering, refund-on-failure (no
charge for a failed generation), structured "out of credits" state.
Made durable (moved off in-memory Maps) by issue 119. Its two metered consumers — video
pages and custom-style training — were later deferred/cut for R1 per
149-dead-ui-endpoint-sweep.md; the ledger mechanism itself remains live.

(condensed 2026-07-07 — full spec in git history)
