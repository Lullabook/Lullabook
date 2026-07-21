# Session Handoff — 2026-07-21 — R1 tickets 176–185 complete

## Outcome
All ten tickets of the R1 Family/Persona/provider-economics chain
(CONTEXT/issues/176–185) are implemented and green on branch
`feat/prd-v20-pillar-a-payment` (uncommitted, per instruction).

Final state: `npm run verify` PASS — 139 test files / 817 tests
(baseline at session start: 127 files / 740). Typecheck root+mobile clean.

## Per-ticket verification (each gate re-run by the session lead, not
taken from subagent self-reports)
- 176 provider bake-off harness: 7/7. `smoke:provider-bakeoff` blocked-by-default (exit 2).
- 177 R1 plan/entitlement: canonical `src/domain/plan.ts` ($14.99/mo, $119.99/yr,
  4 Storybooks/monthly, 3 shared Personas, 3 starring, 1 Member login). Legacy
  ADR-0025 tests reconciled to ADR-0028 (146 one-baby cut removed, caps updated).
- 178 atomic consent-safe creation: 9/9 + RLS; migration 012.
- 179 fal LoRA ZIP/queue/signed webhook: 12/12. ED25519 verify order
  (timestamp → body hash → parseability → signature → business data);
  malformed OK-results rejected before idempotency-slot consumption;
  owned artifact copy (provider URLs never become owned keys).
- 180 likeness confirmation + cold-start resume: 7/7. Generation-scoped avatar
  keys `avatars/{family}/{persona}/{generationId}.png` (cache-poisoning fix);
  adult acceptance = linked subject Member if one exists, else creating Member
  (R1 single-login reality); exactly-once Brief resume; new API routes +
  `mobile/app/likeness/[id].tsx`; sanctioned `likenessSampleUrl()` helper added
  to test-156's allowlist.
- 181 bounded Story Context + Sonnet contract: 7/7. Semantic invalidity is a
  terminal generation outcome (failed book + released allowance + zero
  illustration spend), not a workflow crash. Tests 148/165 updated: context
  engine restored per PRD v21, no longer journal-flag-gated.
- 182 concurrent multi-Persona fanout + repair: 7/7. Single multi-LoRA request
  per Page, bounded concurrency, two-tier repair (NB2 Edit → Pro), no
  inpaintFaces on default path.
- 183 provider COGS metering + kill switches: 7/7. ±5%/5-10%/>10% variance,
  70% margin floor, kill switch preserves drafts + Hard-delete.
- 184 RLS + Hard-delete across provider artifacts: 4/4. Migration 013;
  inventory-based idempotent delete incl. LoRA/config blobs, review samples,
  cost ledger (non-content evidence retained); provider-degraded path reports
  limitations machine-readably.
- 185 deterministic release-gate harness: 8/8. `smoke:r1-provider-e2e`
  refuses without credentials/budget, $2 ceiling, blocked-by-default (exit 2
  verified with placeholder credentials, no network), machine-checkable flow
  checklist for the paid run.

## Still requiring explicit user authorization (deliberately NOT run)
1. Ticket 176 live bake-off canary — $10 total research ceiling
   (`LIVE_PROVIDER_BUDGET_USD` + real keys + reviewed live adapters).
2. Ticket 185 live smoke — $2 ceiling, same wiring pattern.
Both harnesses exit blocked(2) by design until a separately reviewed
live-adapter implementation is provided.

## Known pre-existing issues (out of scope, unchanged)
- eslint `@typescript-eslint/no-require-imports` in src/instrumentation.ts
  (breaks `next build` lint step; `npm run verify` unaffected).
- CI mobile workspace can't resolve `expo/tsconfig.base`.

## Notes for next session
- Nothing committed/staged; 70+ modified/untracked files on the branch —
  commit strategy is the user's call (suggest: one commit per ticket or one
  squash for the wave).
- Stray Finder-style "name 2.ext" duplicates appeared during parallel agent
  work; two were removed (a broken test copy and a .next types copy). If more
  appear under .next/ they are build-cache noise.
- tests/93 setTier helper now maps legacy tier names through
  `legacyTierToR1Plan` — use `setTier(ctx, familyId, "basic"|"family")`
  semantics when touching entitlement tests.
