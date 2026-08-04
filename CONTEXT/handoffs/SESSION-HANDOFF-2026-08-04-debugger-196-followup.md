# Debugger follow-up — #196 Adult Member database contract

- **Ticket:** #196
- **Commit:** `7d487d7`
- **Purpose:** align legacy PostgreSQL contract tests with the PRD v22 Adult Persona authority rule.

The old tests still expected Guardian-only Adult reservation/finalization. They now prove the intended split: Baby remains Guardian-only, while an own-subject authenticated Member may prepare/finalize an Adult; unrelated-member mutation remains covered by the #196 lifecycle suite.

Evidence: `npx vitest run tests/177-persona-cap-concurrency.integration.test.ts tests/178-persona-creation-protocol.integration.test.ts` — **45/45 passed**.
