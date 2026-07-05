# Session Handoff — /part1: PRD v18 (PDF Export keepsake)

> Date: 2026-07-05. Type: `/part1` planning chain (grill → invariants → PRD → issues →
> handoff → push). Effort: **mobile PDF export** — the last unshipped R1 core-loop step
> (aha-path 9–10: finalize → export). Same session continues into `/part2` (build
> 160–161) and `/part3` (review), per the founder's instruction — this handoff is the
> pointer map for that continuation and for any fresh agent.

## Locked decisions (grilled with the founder this session)

1. **Explicit finalize**: "Finalize keepsake" CTA on drafts with a confirm sheet that
   names the re-roll lock; export appears only after `finalized`. No auto-finalize.
2. **Delivery = iOS share sheet**: `expo-file-system` + `expo-sharing`, download with
   auth bearer to app cache, native share sheet. No silent saves.
3. **Failure contract**: 30s p95 budget / 45s client abort / manual retry only; the
   book stays `finalized` and uncorrupted on any failure.
4. **Gating = ownership + finalized only**: no new entitlement check (R1 one-plan).

Ground truth that shaped the plan: `ExportService.exportPdf` and
`StorybookService.finalize` already exist server-side; **no finalize API route
exists**; the mobile reader has neither affordance; `mobile/` lacks the two Expo deps.
No glossary changes needed — CONTEXT.md's **Export** entry already matches.

## Invariants (E1–E6, full text in the PRD — /part2 red-team + /part3 targets)

- **E1** export p95 <30s (≤8 pages), 45s client abort, never a frozen wait.
- **E2** failure → retryable error, idle button, book stays `finalized`, no partial
  file left in cache.
- **E3** likeness egress: authenticated fetch, file only in app-cache sandbox, leaves
  the device only via the user-initiated share sheet.
- **E4** finalize server-authoritative + deliberate (confirm names the re-roll lock;
  client refetches, never flips status locally).
- **E5** Maya's World design canon on all new UI.
- **E6** no dead buttons: export CTA hidden where sharing is unavailable (web preview).

## Artifacts

- **PRD:** `CONTEXT/planning/prd-v18-pdf-export-keepsake.md` (ready for agent)
- **Issues:** `CONTEXT/issues/160-finalize-storybook-route-and-cta.md` (no blockers),
  `CONTEXT/issues/161-pdf-export-download-share-sheet.md` (blocked by 160). Each has a
  runnable Verification-command (`npx vitest run tests/16N-*.test.ts && npm run verify`).
- Issue split (two vertical slices) approved by the founder.

## Next agent starts at issue 160

`/part2` selection rule → **160** (lowest-numbered, unblocked). Then 161. Fix
test-first against each issue's Verification-command; budget 5 iterations. The
`/part3` reviewer agent `.claude/agents/part3-lullabook.md` exists — reuse verbatim.

## State carried from earlier in this session

- `/part3` review pass #2 is merged-ready on PR #110 (branch `part3/mobile-review-2`,
  commit `735561a`): dead Apple button on web fixed, 156 guards hardened, checker
  grade PASS, 558 tests green. This planning work is stacked on that branch.
- `mobile/.env` (gitignored) points at LAN IP `172.20.10.2:3001` for physical-iPhone
  Expo Go testing; recipe in the part3 handoff.
- Open founder question (unresolved, not blocking): billing.tsx "Founding families get
  the first month free after the trial" — confirm the offer is real or cut the line.
