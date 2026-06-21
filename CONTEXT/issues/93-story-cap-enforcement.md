# 93 — Story-cap & member-cap enforcement (server-side, monthly reset)

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track A.

## What to build
Enforce the monthly **Story cap** (4/8/20) and the **Family-member cap** (2/4/∞)
server-side and idempotently, with a clear user-facing limit state.

- Count finalized/generating Stories against the Household's monthly cap; reset monthly.
- Reject over-cap generation server-side with a structured "limit reached" result
  (resets-on DATE + upgrade path), **not** a 500.
- Enforcement is **idempotent**: a replayed/duplicate generation request can't consume
  two slots (ties into ADR-0011 / issue 16 money-safety).

## Acceptance criteria
- [ ] At cap, a new generation is refused server-side with a structured limit state
      (count, reset date, upgrade CTA) — never a dead end, never a crash.
- [ ] **Security invariant:** the cap is enforced server-side and **idempotently** —
      request replays don't bump the count or bypass the limit.
- [ ] Monthly reset restores the allowance; member-cap rejects the (cap+1)th member.
- [ ] A failed generation does **not** consume a Story slot.
- [ ] Tests cover at-cap refusal, idempotent replay, monthly reset, and member-cap.

## Verification-command
```bash
npm test -- story-cap && tsc --noEmit
```

## Blocked by
91
