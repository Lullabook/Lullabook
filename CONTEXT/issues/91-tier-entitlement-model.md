# 91 — Tier & entitlement model (ADR-0023)

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track A.

## What to build
The **server-side source of truth** for what a Household may do: tier (Basic/Normal/Plus),
caps (Stories/mo, Family members), and capability gates (narration, video, custom style).

- An `Entitlement` model derived from the validated tier: per-tier Story cap (4/8/20),
  Family-member cap (2/4/∞), and capability flags.
- A single server-side **authorization check** every gated use-case calls; unentitled
  calls **reject with 403**. The client UI gate is UX only and must not be the boundary.
- Wire the existing gated features (narration/voice issue 38/39, video issue 42,
  custom style issue 95) to consult the entitlement, replacing the dev-forced gate.

## Acceptance criteria
- [ ] Entitlement correctly maps tier → caps + capability flags per ADR-0023.
- [ ] **Security invariant:** a Basic Household calling a narration/video/custom-style
      endpoint gets **403 server-side** (not just a hidden button); enforcement is
      **idempotent** (replays don't bypass).
- [ ] Family-member creation beyond the tier cap is rejected server-side.
- [ ] `DEV_FORCE_SUBSCRIPTION` remains a dev-only override and is documented as never-ship.
- [ ] Tests (test-first) cover each tier's caps/flags and the 403 boundary for each gate.

## Verification-command
```bash
npm test -- entitlement && tsc --noEmit
```

## Blocked by
None — server entitlement model; precedes the IAP wiring (92).
