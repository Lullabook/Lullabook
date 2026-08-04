# Session Handoff — 2026-06-21: finish issue 91 (Tier & entitlement model, ADR-0023)

Status: historical

Close-out pointer for issue 91: `EntitlementService` (tier→caps+flags, 403 gates
`requireEntitled`/`requireCapability`/`requireMemberSlot`) already built and green
(15/15; full run 62 files/260 tests); remaining work was the `DEV_FORCE_SUBSCRIPTION`
never-ship doc note + commit. Shipped.

- Binding: entitlement gates live at the service seam (real 403 boundary), not UI.
- Binding: `DEV_FORCE_SUBSCRIPTION` is dev-only and must never ship.
- `tsc --noEmit` noise (macOS " 2."/" 3." dupe artifacts, old test-type smells) predates
  the wave — don't chase it inside feature issues.

(condensed 2026-07-07 — full text in git history)
