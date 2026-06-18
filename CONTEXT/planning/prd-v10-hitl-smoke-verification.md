# PRD v10 — HITL full-app smoke verification

> Status: ready for agent. Planning artifact from `/part1` (2026-06-18).
> Parent context: PRD v9 (`prd-v9-mobile-feature-wave.md`) shipped issues 74–81; the
> code is on `main` and the issues are closed, but several carried a "Manual Simulator
> pass recorded (HITL)" acceptance criterion that was never executed. This PRD turns the
> owed verification — plus a full-app smoke — into runbooks a human can execute.

## Problem

The app's recently-shipped flows (Journal, Firsts, Storybook generate + reader, social
auth, photo upload, hard-delete) have **green unit tests but no recorded end-to-end
human pass**. We don't actually know the real Anthropic + fal.ai LoRA pipeline produces a
readable Storybook on device, that auth lands a Bearer session, or that hard-delete truly
purges blobs. This is the "adult in the room" gap: the suite proves the seams, not the
product.

## Goal

Produce **executable HITL runbooks** that let the product owner smoke-test every major
flow on the **local iOS Simulator against `npm run dev:paid` (:3001)**, with concrete
PASS/FAIL criteria, and a clean path to **file a defect issue** when a step fails. No app
code changes unless a defect is found (then filed/fixed separately) — matching the issue
63 / 73 runbook convention.

## Locked decisions (from the grill)

- **Environment:** local iOS Simulator → local backend `npm run dev:paid` at `:3001`.
  The dev subscription gate is force-unlocked (`DEV_FORCE_SUBSCRIPTION`).
- **Apple Sign-In caveat:** a bare Simulator may not have an Apple ID. If Simulator
  Apple-ID sign-in is unavailable, that single step **defers to a real device/TestFlight**
  (reuse issue 63 runbook); everything else stays local. This is the one known partial.
- **Deliverable:** one consolidated runbook doc at
  `CONTEXT/local-dev/HITL-SMOKE-RUNBOOK.md` + a small set of dependency-ordered HITL
  issues by functional area.
- **Scope:** **full-app smoke** — not just v9; every major flow end to end.
- **On failure:** file a **new defect issue** (label `bug` + `ready-for-agent`) with the
  runbook repro steps; closed feature issues stay closed.
- **Test data:** a **dedicated test Family** with dev/sample photos only — never real
  children's photos or production users. Wiping it at the end doubles as the hard-delete
  check.

## Invariants (acceptance constraints — the PASS/FAIL contract)

These are the stopwatch and the boundaries every runbook step is measured against. A
deviation is a **FAIL → new defect issue**.

### Latency / performance budgets
- Storybook generation: `generating → draft` within **5 min**.
- Reader page image (authenticated image path): loads within **30s** per page.
- Home/API responses (`/api/home`, lists): **p95 < 1s** on local `dev:paid`.
- Moment capture → appears at top of timeline: **< 2s** (optimistic add, reconciled by refetch).

### Failure modes (expected observable behavior)
- Backend down / 5xx → in-screen error via the kit (`C.danger`); **no crash, no unhandled
  promise rejection**.
- Generation failure → `failed` status that is **re-rollable/retryable**, not a dead end.
- Failed Page in the reader → renders as a **recoverable hole**, not an error screen.
- Missing/expired auth token → routed to sign-in (no white screen / infinite spinner).
- Offline / network error → graceful, retryable error state.

### Security / permission boundaries
- Protected Bearer endpoints reject missing/invalid token with **401**; no data without auth.
- Reader shows only **generated illustrations** — no raw uploaded minor photo is ever
  exposed (ADR-0020).
- Per-Family isolation (RLS): the test account sees only its own Family's data. (Single-
  account smoke is a **limited** check; true cross-Family isolation needs a 2nd account —
  flagged, not blocking this wave.)
- `DEV_FORCE_SUBSCRIPTION` is **dev-only**; the runbook states it must never ship enabled.
- **Hard-delete propagates** across DB *and* blob storage — verified by wiping the test
  Family and confirming photos/storybooks/account are gone.
- Real secrets/keys are **never committed**; runbooks reference env-var *names* only.

### HITL process invariants
- Dedicated test Family + dev sample photos only (see locked decisions).
- Every step records a concrete PASS/FAIL observation (runbook has a results table).
- No code change in a HITL slice unless a defect is found (file/fix separately).

## Scope (full-app smoke, by area)

1. **Foundation** — environment + test-Family setup, env/secrets checklist, OAuth
   provider prerequisites, the consolidated runbook scaffold + global PASS/FAIL table.
2. **Auth & account** — Google sign-in (Supabase provider + redirect config), Apple
   sign-in (device caveat), session restore, account read, hard-delete propagation.
3. **Family & roster** — create member/persona, photo upload (issue 70), training→ready
   lifecycle, roster avatars, edit Character (issue 80).
4. **Journal / Firsts / Moments** — Moment capture + timeline persistence (75), Firsts
   filter + "Make this a Story" offer (76), moment-photo write-only (65/71), birthday
   offer (68/72).
5. **Storybook generate & reader (real pipeline)** — Brief → generate (78) → poll →
   draft within budget, paged reader (79), re-roll/candidate select, failed-page hole,
   lullaby real-path (folds in issue 73).
6. **Cross-cutting failure & boundary sweep** — backend-down/5xx, offline, 401/token
   expiry, dev-gate-off check, isolation note.

## Out of scope
- TestFlight/device build (issue 63 already covers it; Apple Sign-In defers there only if
  the Simulator can't sign in).
- Payment/monetization verification — its own future `/part1` (PRD v9 deferral stands).
- Any new feature work; this wave only verifies what shipped.

## Testing approach
- These are **manual** runbooks executed by a human with real keys; the deliverable per
  slice is the runbook section + a recorded results pass, not new automated tests.
- Existing automated suite stays green; if a runbook surfaces a defect, the fix is a
  separate slice with its own tests (TDD), not folded into the HITL slice.

## Issues
See `CONTEXT/issues/82`–`87` (GitHub #29–34). Dependency-ordered; start at 82.
