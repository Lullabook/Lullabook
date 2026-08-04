# Part3 — #205 hardening

- **Ticket:** #205 / local 197
- **Commit:** `bc855c0`
- **Status:** Debugging; live/human evidence remains blocked.

Fixed tangible audit findings: replacement staging keys now carry Family scope and Hard-delete inventories both new and legacy staging prefixes; credit ledger/balance artifacts are deleted and reported; the Persona reservation consent FK is migrated to cascade so sync cannot delete a receipt before its abandoned reservation; cross-Family RLS proofs require target ownership metadata; moderation residual ownership and evidence-output sensitive material are rejected; billing charges require non-synthetic billing-export provenance.

Evidence: `npx vitest run tests/197-production-rls-delete-evidence.test.ts` — **9/9 passed**; scoped diff checks passed.

Remaining release blockers: deterministic PASS items are still caller-supplied rather than derived from a live command runner, restart proof still uses an in-memory store, production hard-delete lacks cache/CDN/backup/provider adapters and user-visible pending state, and human/native/provider/billing evidence remains required. Do not claim release readiness or Done from this harness alone.
