# 217 — Grant demo Pro entitlement server-side without bypassing the gate

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.

## What to build

The demo needs full Pro access in the iOS Simulator, but the Simulator has no
native purchase client, so a real RevenueCat purchase cannot complete there. Add
a prod-guarded, server-authoritative grant that gives the demo Family a Pro
entitlement. The entitlement gate must still be exercised on every request. This
is a grant, not a bypass: the server remains the single source of truth for
entitlement, exactly as it is for a paying Guardian.

Stripe and web payment are a post-demo release concern and are out of scope here.

## Acceptance criteria

- [ ] A server endpoint grants a Pro entitlement to a named Family, and the
      granted entitlement is persisted and read back through the same code path
      a real purchase would use (`ENT-1`).
- [ ] Every gated route still evaluates the entitlement gate on each request; no
      route short-circuits because the grant is present (`ENT-1`).
- [ ] The grant endpoint is refused in a production configuration unless an
      explicit demo flag is set, and the refusal is tested.
- [ ] A client-supplied entitlement claim is never trusted; the server value
      always wins, and a test proves a forged client claim is ignored.
- [ ] Revoking the grant immediately returns the Family to the free tier on the
      next gated request.
- [ ] `DEV_FORCE_SUBSCRIPTION` is not used to satisfy this ticket, and a test
      asserts the demo path does not depend on it.

## Verification-command

```bash
npx vitest run tests/217-demo-pro-entitlement.test.ts && npm run verify
```

## Blocked by

none

## Invariants restated

`ENT-1`, `SEC-1`, `SEC-5`

## Notes

The Guardian's words: "for the simulation I will just get full access, full pro,
because it's my own app." The honest way to do that is a real server grant, so
the gate the product depends on is still proven to work.

**Target backend:** Vercel.
