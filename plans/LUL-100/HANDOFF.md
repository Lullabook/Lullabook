# LUL-100 planner handoff

## Decision summary

- Preserve LUL-101 through LUL-110; do not duplicate LUL-103.
- Add only LUL-129 (actual-PostgreSQL authenticated RLS harness) and LUL-130 (prepare/finalize RPC, creation-scoped blob compensation/reconciliation, and durable outbox), because the blocked coder run proved both foundations absent.
- Repair the active production safety/security chain in this order: LUL-129 → LUL-130 → LUL-103 (production moderation-before-persistence wiring) → LUL-104 (signed fal route and durable callback idempotency).
- Test through native/API/workflow production composition plus real Supabase policies; fake providers remain only at adapter boundaries.
- Persist claims and inventories required by capacity, callbacks, Brief recovery, metering, provenance, and Hard-delete.
- Treat R1 as exactly twelve Pages; legacy five-Page Stories remain outside R1.
- Hard-delete Family-scoped cost/allowance records so SQL and application policy agree.
- Never convert deterministic/fake evidence into provider/model or release approval.
- Keep the `$10` canary and `$2` provider smoke blocked pending fresh, separate user authorization.
- Treat ignored `* 2.*` Next declarations and reverted prototype copies as transient workspace cleanup, not a tracked source prerequisite. Preserve the unrelated tracked `next-env.d.ts` change.

## Pointer map

- Spec and invariants: `plans/LUL-100/PLAN.md`
- Dependency-ordered issue bodies and commands: `plans/LUL-100/TICKETS.md`
- Accepted product decision: `CONTEXT/docs/adr/0028-r1-family-persona-provider-economics.md`
- Independent audit: `CONTEXT/handoffs/DEBUG-AUDIT-2026-07-21-r1-176-185.md`
- Local issue originals: `CONTEXT/issues/176-provider-bakeoff-cost-gate.md` through `CONTEXT/issues/185-production-r1-provider-e2e-gate.md`

## Invariant index

- Child/adult safety: SAFE-1, SAFE-2
- fal callback and owned artifacts: PROV-1, PROV-2, OWN-1
- Family/entitlement: FAM-1, ENT-1
- Failure/recovery: FAIL-1, LIKE-1
- Story Context/text: CTX-1
- Illustration: IMG-1
- Spend controls: COST-1, COST-2
- Isolation/deletion: RLS-1, DEL-1
- Corrective foundations: RLS-H1, ATOM-H1
- Evidence/authorization: EVID-1, LIVE-1

Full observable conditions and verification approaches are in `PLAN.md`.

## Ticket order

1. LUL-129 — no blockers — Urgent — actual-PostgreSQL authenticated RLS harness
2. LUL-130 — blocked by LUL-129 — Urgent — crash-safe Persona persistence/blob/outbox protocol
3. LUL-103 — blocked by LUL-129 and LUL-130 — Urgent — production Persona wiring
4. LUL-104 — blocked by LUL-103 — Urgent
5. LUL-102 — blocked by LUL-103 — High
6. LUL-108 — blocked by LUL-104 — High
7. LUL-105 — blocked by LUL-104 — High
8. LUL-106 — blocked by LUL-102, LUL-108 — High
9. LUL-107 — blocked by LUL-104, LUL-106, LUL-108 — High
10. LUL-109 — blocked by LUL-103–LUL-108 — Urgent
11. LUL-101 — blocked by LUL-104, LUL-106–LUL-109 — Medium; live canary still blocked
12. LUL-110 — blocked by LUL-101–LUL-109 — Urgent; live smoke still blocked

## Recommended next coder ticket

LUL-129. It is the only genuinely unblocked Coding implementation ticket and gives every downstream safety assertion a real PostgreSQL/RLS boundary. Then LUL-130 locks the missing atomic protocol; only after both pass is LUL-103 runnable. LUL-104 follows LUL-103.

## Commands

Every ticket's exact command is in `TICKETS.md`. The planner's own locked command is:

```bash
git diff --check -- plans/LUL-100 && node -e "const fs=require('fs'); for (const f of ['PLAN.md','TICKETS.md','HANDOFF.md']) { const s=fs.readFileSync('plans/LUL-100/'+f,'utf8'); for (const id of ['LUL-129','LUL-130','LUL-103']) if (!s.includes(id)) throw new Error(f+' missing '+id); }"
```

No locked command invokes `smoke:provider-bakeoff` or `smoke:r1-provider-e2e`.

Product-wide `npm run verify` is intentionally not the corrective planner lock: current root typecheck errors name ignored `.next/types/* 2.ts` declarations and ignored reverted prototype files under `src/`. The coder owns cleanup of those transient artifacts before its implementation lock; no unrelated product source is changed by this handoff.

## Open evidence gates

- `$10` provider bake-off: blocked until a fresh authorization identifies the fixtures and hard budget.
- `$2` production-like provider smoke: blocked until all deterministic prerequisites and the canary result are independently verified, followed by a fresh authorization.

No model routing, price/cap change, deployment, publication, or PR action is authorized by this handoff.
