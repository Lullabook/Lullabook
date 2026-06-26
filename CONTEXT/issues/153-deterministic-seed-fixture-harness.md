# 153 — Deterministic seed/fixture harness (testing never starts from zero)

Triage: ready-for-agent

## Parent
PRD v17 — `CONTEXT/planning/prd-v17-test-framework-and-logging.md`. Track T4. Builds on issue 124.

## What to build
Generalize R1 issue 124's honest seed into a **deterministic, repeatable test fixture**: one
command yields a known-good Household + solo Guardian + one baby + family roster + a **real
illustrated Bedtime book** (using `DEV_FAL_FALLBACK`). Same seed input → identical data, so
manual and automated tests start from a known-good state every time instead of nothing.
Double-gated (`NODE_ENV !== "production"` AND a flag); inert in prod; a failed seed leaves no
partial Household.

## Acceptance criteria
- [ ] One command produces a complete known-good world: Household + baby + family + an
      **illustrated `draft`** book (≥1 image via `DEV_FAL_FALLBACK`).
- [ ] **Deterministic:** identical output for the same seed input (asserted).
- [ ] **Double-gated + inert in production**; a mid-seed failure rolls back (no partial
      Household).
- [ ] Reusable by both manual testing and the e2e/smoke suites (shared fixture, not a one-off
      script).

## Verification-command
```bash
npm test -- 153-deterministic-seed
```

## Blocked by
124
