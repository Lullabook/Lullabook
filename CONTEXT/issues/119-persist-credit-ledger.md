# 119 — Persist the credit ledger
Status: shipped
Moved the credit ledger + purchased-credit balances from in-memory Maps (credit-ledger.ts) into the durable DataStore so they survive restart. Debit/refund stay idempotent by action:idempotencyKey; a failed metered action always refunds and never blocks the Story.
Invariant still binding.
(condensed 2026-07-07 — full spec in git history)
