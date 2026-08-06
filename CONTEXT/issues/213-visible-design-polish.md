# 213 — Polish every visible screen to a shipped-app standard

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

Audit and fix the visible surface of the app so it reads as a finished product, using the `better-ui`, `better-colors`, and `better-typography` skills together with the project design skills. Cover every screen the Guardian passes through, not only the demo five.

## Acceptance criteria

- [ ] Every screen reachable in the Guardian journey is audited, and the audit list is recorded in the ticket evidence.
- [ ] Colour, type scale, radius, shadow, and spacing match the project design tokens on every audited screen; each deviation is either fixed or recorded with a reason.
- [ ] Text contrast meets WCAG AA on every audited screen.
- [ ] Safe areas, notch, and home indicator are correct on an iPhone-shaped viewport (D2).
- [ ] Loading, empty, and error states exist for the roster, Persona training, Story generation, and reader screens; no screen shows a bare unbounded spinner (`LAT-5`).
- [ ] No layout shifts or clipped text at the default Dynamic Type size.

## Verification-command

```bash
npm run lint && npx vitest run tests/213-design-tokens.test.ts && npm run verify
```

## Blocked by

202

## Invariants restated

LAT-5

## Notes

The Guardian asked for full visible polish, not a five-screen pass. Run it in parallel with the training pipeline; it shares no files with it.

**Target backend:** Local dev, for a fast iteration loop.
