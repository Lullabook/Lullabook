# 88 — Verify Add-Family photo upload on iOS Simulator (issue-70 gate)

Triage: ready-for-agent (HITL)

## Parent
PRD v11 — `CONTEXT/planning/prd-v11-issue70-upload-verification.md` (addendum to v10).

## What to build
The recorded verification — and its machine-checkable proxy — that mobile Add-Family
photo upload actually works end to end after the B1/B2 fix (commit `dc3f836`). This is
**Gate 0** for the v10 HITL wave: every downstream slice (83–87) needs a created
persona, so this runs first.

Three pieces:

1. **Root vitest unit test** for the FormData builder — `tests/mobile-form-data.test.ts`
   importing `../mobile/lib/form-data`. Asserts `appendNativeFile` / `setNativeFile`
   produce the React Native `{ uri, name, type }` parts (not web Blobs) and that a
   built `FormData` for Add-Family carries the expected keys (`mode`, `displayName`,
   `relationship`, `babyCalls`, `theyCallBaby`, one-or-more `photos`, optional
   `selfie`). Runs under the existing root vitest (`tests/**/*.test.ts`); no mobile
   test harness is introduced.
2. **Runbook §2 sub-step** — add an `### §2.x Add-Family photo upload (issue 70)` step
   to `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` with concrete PASS/FAIL observations
   (submit → `202`; photo present in Family-scoped blob; no raw photo rendered; selfie
   optional; camera-deny graceful) and a row in the results table.
3. **Extend the checker** — `scripts/check-hitl-runbook.mjs` requires the new §2
   issue-70 step heading and its results row, so `npm run check:runbook` fails if the
   step is dropped. (Follows the issue-82 gate pattern.)

Then **execute the human Simulator pass** against `npm run dev:paid` (:3001) and record
the result in the runbook table.

## Acceptance criteria
- [ ] `tests/mobile-form-data.test.ts` proves the builder emits correct multipart parts;
      whole root suite stays green.
- [ ] Runbook §2 gains the issue-70 Add-Family photo-upload step + a results row; the
      extended `check:runbook` requires it (and fails without it — fault-inject to prove).
- [ ] **HITL recorded:** on the Simulator, Add-Family `submit()` → `POST /api/personas`
      returns **`202` within 10s** for ≤6 photos (latency invariant).
- [ ] **HITL recorded:** the uploaded photo is present in the **Family-scoped blob
      store** — verified to exist, not assumed (security invariant).
- [ ] **HITL recorded:** **no raw uploaded photo** is rendered on any mobile surface;
      only the generated `RosterAvatar` shows (ADR-0020 / ADR-0021).
- [ ] **HITL recorded:** upload 5xx/network error → in-screen retryable error, **no
      crash / unhandled rejection**, form stays mounted; camera-permission denial is
      graceful; selfie omitted still succeeds (failure-mode invariant).
- [ ] `POST /api/personas` with a missing/invalid Bearer returns **`401`** (no anonymous
      upload) — recorded.
- [ ] Test Family uses dev/sample photos only; no real child's photo; no secret committed.

## Verification-command
```bash
npm test -- mobile-form-data && npm run check:runbook
```
Exits 0 iff the FormData-builder unit test passes (proving the wiring that closed B1)
**and** the runbook is internally consistent with the required §2 issue-70 step + row.
This is the machine-checkable done-condition; the `202`/blob/no-raw-render observations
are real-key HITL and are recorded in the runbook results table, not asserted in CI.

## Blocked by
None — this is **Gate 0**. It **blocks** issues 83–87 (they assume a persona can be
created). Run before any other HITL slice in the v10 wave.
