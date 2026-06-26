# 155 — Mobile/Expo e2e: headless iOS flow for the core loop

Triage: ready-for-agent

## Parent
PRD v17 — `CONTEXT/planning/prd-v17-test-framework-and-logging.md`. Track T6.

## What to build
Add the first **mobile e2e** for the iOS app (the shipping surface, which has none today). Use
Maestro (YAML flows, headless, agent-friendly, CI-runnable) to drive the **core R1 loop** on the
iOS Simulator against the deterministic seed (153): open → see the seeded illustrated book → open
the reader → turn a page → export a PDF. This gives an agent a way to confirm the *actual
shipping surface* works without a human tapping through it.

## Acceptance criteria
- [ ] A Maestro flow drives the core loop on the iOS Simulator (seeded book → reader → page turn
      → PDF export) and passes against the 153 seed.
- [ ] Runnable headless / from the CLI by an agent (no manual taps); documented command.
- [ ] Asserts the R1 reader budgets observably hold (page turn responsive; no infinite
      "Illustrating").
- [ ] Folded into `verify` (154) as an optional/tagged mobile stage so it doesn't block the fast
      suite when no Simulator is available.

## Verification-command
```bash
maestro test mobile/.maestro/r1-core-loop.yaml
```

## Blocked by
153, 154
