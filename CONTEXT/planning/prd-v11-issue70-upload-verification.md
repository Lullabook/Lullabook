# PRD v11 — iOS Add-Family photo-upload verification gate (addendum to v10)

> Status: ready for agent. Planning artifact from `/part1` (2026-06-20).
> **Relation to v10:** this is a thin **addendum** to
> `prd-v10-hitl-smoke-verification.md`, not a replacement. PRD v10 and its issues
> **82–87 stand unchanged.** v11 adds exactly one new issue (88) and a re-pointing
> mapping so the owed Simulator passes for issues 75–81 are discharged by v10's
> existing runbook sections instead of being re-planned.
> **Scope guard:** iOS app only. The web/browser `live-app-audit` (hermes) is
> explicitly **out of scope** here and is user-triggered later.

## Why this exists (the delta since v10)

PRD v10 was written 2026-06-18, when mobile Add-Family photo upload was **broken**
— Simulator HITL bugs **B1** (web-Blob FormData parts rejected by React Native) and
**B2** (selfie camera-permission crash), logged in
`SESSION-HANDOFF-2026-06-16-mobile-simulator-hitl-bugs.md`. v10 therefore listed
"photo upload (issue 70)" only as a line item inside its §2 Family & roster runbook,
assuming it might still fail.

Since then the **fix landed** (commit `dc3f836`, 2026-06-19):
- `mobile/lib/form-data.ts` — `NativeUploadFile` + `appendNativeFile` / `setNativeFile`
  build React Native `{ uri, name, type }` multipart parts (not web Blobs).
- `mobile/app/family/new.tsx` — `submit()` is fully wired: builds `FormData`, appends
  photos + optional selfie via the helper, calls `createPersona(fd)` →
  `POST /api/personas`, then navigates. No TODO stub remains.

So issue 70's **code is done but the end-to-end pass has never been recorded.** This
PRD turns that single owed verification into a first-class, dependency-gating issue,
because Add-Family persona creation is the prerequisite for every downstream HITL
slice (roster avatars, storybook generation all need a trained persona).

## Problem

We don't actually know — on a real Simulator against the real backend — that a photo
selected in the iOS app reaches the Family-scoped blob store and that `POST
/api/personas` returns `202`. The unit suite is green and the wiring reads correct,
but the fix that made it correct (B1/B2) has no recorded human pass. Until it does,
issues 83–87 cannot be trusted to run (they assume a persona can be created).

## Goal

Produce a recorded **PASS** for Add-Family photo upload on the local iOS Simulator
against `npm run dev:paid` (:3001), gated by a machine-checkable proxy that proves the
wiring and runbook are in place, with the human `202`/blob/no-raw-render observations
captured in the runbook results table. **Gate 0** for the v10 HITL wave.

## Locked decisions (from the grill)

- **iOS only.** Drop the web `live-app-audit`/hermes path from this effort entirely;
  it is deferred and user-triggered.
- **v11 extends v10**; issues 82–87 and the runbook §0–§5 structure are untouched.
- **One new issue (88)** — the issue-70 Add-Family photo-upload verification gate.
- **No duplicate issues** for the owed 75–81 passes; instead the mapping table below
  re-points each closed issue's owed "Manual Simulator pass (HITL)" criterion at the
  v10 runbook section that discharges it.
- **Verification-command** for issue 88 is runnable **today**, without standing up a
  mobile test harness: the `form-data.ts` helper is plain TS over the global
  `FormData`, so its unit test lives in the **root vitest suite** (`tests/`) and
  imports `../mobile/lib/form-data`. The end-to-end `202`/blob check stays HITL and is
  recorded in the runbook, not in the command.
- **Test data:** dedicated test Family with dev/sample photos only — never a real
  child's photo (inherits v10).

## Owed-pass re-pointing map (no new issues — discharge via v10 runbook)

The runbook (`CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md`) sections map to v10 issues:
§0→82, §1→83, §2→84, §3→85, §4→86, §5→87.

| Closed issue | Owed HITL pass | Discharged by (runbook §) | v10 issue |
| --- | --- | --- | --- |
| 70 — mobile photo upload | photo reaches Family blob | **§2.x (new, this PRD)** + dedicated **issue 88** | 84 / 88 |
| 75 — mobile Journal timeline | Moment capture + timeline persists | §3 | 85 |
| 76 — mobile Firsts + story offer | Firsts filter + "Make this a Story" | §3 | 85 |
| 77 — mobile Storybook Bearer API | authed storybook list/read | §4 | 86 |
| 78 — mobile Storybook generate | Brief → generate → draft | §4 | 86 |
| 79 — mobile Storybook reader | paged reader, re-roll, failed-page hole | §4 | 86 |
| 80 — wire remaining stubs | edit Character + hard-delete | §1 + §2 | 83 / 84 |
| 81 — social-only auth | Apple/Google sign-in | §1 | 83 |

Executing v10 issues 83–87 therefore closes every owed 75–81 pass; no separate work.

## Invariants (acceptance constraints — the PASS/FAIL contract for issue 88)

Inherits v10's global invariants; the issue-70-specific gate adds:

### Latency / performance
- Add-Family `submit()` → `POST /api/personas` returns **`202` within 10s** for ≤6
  photos on local `dev:paid`. (Inherits v10: `/api/home` p95 < 1s.)

### Failure modes (expected observable behavior)
- Upload network error / 5xx → in-screen retryable error via `setError`; **no crash,
  no unhandled promise rejection**; the form stays mounted (already coded: `catch →
  setError`, `finally → setSaving(false)`).
- Camera-permission denied on `takeSelfie()` (bug B2) → graceful in-screen message,
  not a crash; selfie is **optional**, so `submit()` still works without it.
- Oversized / wrong-type payload (`413` / `415`) → surfaced as a readable error, not a
  silent failure.

### Security / permission boundaries
- The photo lands in the **Family-scoped blob store** — verified to exist, not assumed.
- **No raw uploaded photo is rendered** on any mobile surface (ADR-0020 / ADR-0021);
  only the generated `RosterAvatar` appears in the Add-Family preview.
- `POST /api/personas` rejects a missing/invalid Bearer with **`401`** — no anonymous
  upload.
- Dev/sample photos only in the test Family; real children's photos never used.
- No real secret is committed; runbook references env-var **names** only.

## Scope

**In:** one runbook sub-step under §2 (Add-Family photo upload, issue 70), a root
vitest unit test for the `form-data.ts` builder, an extension to
`scripts/check-hitl-runbook.mjs` requiring the new §2 step + a results row, and a
recorded human PASS on the Simulator.

**Out:** web `live-app-audit`/hermes (deferred); any new feature work; mobile Moment
**photo** upload (it is currently JSON-only via `createMoment`, a future issue-71 gap,
not a regression); TestFlight/device (issue 63); the 83–87 runbook executions
themselves (those are v10 `/part2` work, unblocked by issue 88).

## Testing approach

- The proxy gate is automated and runs today: `npm test -- mobile-form-data &&
  npm run check:runbook`. It proves the FormData builder emits the correct
  `mode`/`displayName`/`photos`/`selfie` parts and that the runbook §2 issue-70 step +
  results row exist and are internally consistent.
- The true end-to-end (`202`, blob lands, no raw render) is a **manual** Simulator
  pass recorded in the runbook results table — matching the issue 63 / 73 HITL
  convention. No real-key behavior is asserted in CI.

## Issue
See `CONTEXT/issues/88-verify-issue70-photo-upload-gate.md`. **Gate 0**: blocks the
v10 HITL chain (issues 83–87) because every downstream slice needs a created persona.
