# 153 — Deterministic seed/fixture harness (testing never starts from zero)

Status: shipped

Generalized issue 124's seed (`src/dev/deterministic-seed.ts`) into a repeatable fixture: one
command yields a known-good Household + solo Guardian + one baby + roster + a real illustrated
Bedtime book (`DEV_FAL_FALLBACK`). Same seed input → identical output. Double-gated
(`NODE_ENV !== "production"` + flag), inert in prod; failed seed rolls back, no partial
Household. Shared baseline reused by manual testing, `verify` (154), and Maestro e2e (155).

(condensed 2026-07-07 — full spec in git history)
