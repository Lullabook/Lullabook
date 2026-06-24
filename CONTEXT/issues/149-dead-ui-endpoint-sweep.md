# 149 — Dead-UI / dead-endpoint sweep (the cut is a cut, not a hide)

Triage: ready-for-agent

## Parent
PRD v16 — `CONTEXT/planning/prd-v16-r1-ruthless-cut.md`. Track S5 — the wave's acceptance gate.

## What to build
The done-signal for the simplification wave: an automated check asserting **no deferred R1
feature has reachable UI or an open endpoint**. Sweep the surfaces cut in 145–148 (audio,
multi-family/invites/voice-messages, Asia jurisdiction, the deferred Journal machinery) plus the
v14 R2-defer list (video pages, custom art style, share links, personalized classics, roster
avatars, multi-baby). Each must be **inert** — gated server-side (clean `404`/`403`) with no dead
button. Produce a readable report of what was checked.

## Acceptance criteria
- [ ] A single check enumerates the deferred features and asserts, for each: no reachable mobile
      UI affordance **and** the relevant endpoint is disabled server-side (`404`/`403`, never 500).
- [ ] The check **fails loudly** if any deferred feature becomes reachable again (regression
      guard for R2 work leaking into R1).
- [ ] No R1 latency budget regressed by the cut (cold start still < 3s); ideally cold start
      shrinks.
- [ ] Output is a human-readable pass/fail report (extends the existing runbook-check pattern,
      `scripts/check-hitl-runbook.mjs`).

## Verification-command
```bash
npm test -- 149-dead-surface-sweep
```

## Blocked by
145, 146, 147, 148
