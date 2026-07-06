# 165 — Restore the Journal (solo, one Baby) — un-cut

Triage: ready-for-agent

## Parent
PRD v19 — `CONTEXT/planning/prd-v19-working-core-loop.md`, per
[ADR-0026](../docs/adr/0026-restore-journal-and-learning-uncut-r1.md). The World home
already advertises "Your baby's Journal — log a moment, see the timeline"; today that leads
nowhere. Restore the reachable Journal over the existing Moments API — **solo, one Baby**.

## What to build
1. **Flip the gate (I3.2).** Set `EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED=true` on the
   mobile surface and align `src/lib/r1-config.ts` so the Moments create/list endpoints are
   reachable. Server + mobile mirror flip together.
2. **Reachable UI.** A per-Baby Journal surface (the [Moment](../CONTEXT.md#moment)
   timeline) reachable from the World home Journal card and a route/tab: list Moments
   newest-first, log a Moment (free text + date + optional `significant ✨`), empty-state
   when none. Reuse `mobile/app/daily.tsx` capture where possible; do not build Firsts /
   weekly / Birthday suggestions (still cut).
3. **Generation independence (I2.4, critical).** Un-cutting the Journal must NOT make story
   generation depend on Moments. `isR1JournalMachineryEnabled()` continues to gate ONLY the
   auto-context injection in `src/services/storybook.ts` `runGenerationBodyInner`; a book
   with **zero Moments** still generates (issue 162 path). Add a test that proves it.
4. **Failure/empty handling (I2.4).** Moments list/create failure → inline retry or
   empty-state, never a blank screen or dead card.

## Acceptance criteria
- [ ] With the flag on, the World Journal card opens a working per-Baby Journal; log +
      timeline round-trip over the real Moments API (I1.2: first paint p95 < 300ms local,
      capture < 1s).
- [ ] I2.4: generation succeeds with **zero** Moments; auto-context injection stays
      independently gated (no new hard dependency).
- [ ] I3.2/I3.3: server + mobile gate agree; Moments ride the Baby's existing consent +
      Hard-delete path; no cross-Household read (solo, one Baby).
- [ ] With the flag off, the Journal is inert (no dead card). Mobile typecheck clean;
      existing suite green.

## Verification-command
```bash
npx vitest run tests/165-journal-restore.test.ts && npm run verify
```

## Blocked by
162
