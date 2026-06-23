# Session Handoff — 2026-06-23: R1 implementation (PRD v14, issues 122-135) → merged

> Implementation session. PRD v14 (R1 release) is **built, red-teamed, and merged**
> (PR #82 → main). PRD v15 (UI polish) is **not started**. A separate planning
> effort (PRD v16/v17) was in-progress in the working tree at session end —
> **do not discard it** (see "In-flight, not mine" below).

## What this session did

Picked up PRD v14 (R1) at issue 122 and drove all three tracks to green, then
red-teamed and fixed 5 bugs (3 merge-blockers). Two PRs landed:

- **PR #81** (merged) — `/part1` planning artifacts: PRD v14/v15, decisions doc,
  issues 122-144, UI snapshots, expo-av red-screen fix.
- **PR #82** (merged) — `/part2` + `/loop-engineer` implementation of PRD v14
  (issues 122-135). This handoff is about #82.

## R1 (PRD v14) — what shipped

### Track A — the loop produces a real illustrated story (122-126)
- **122** — fal illustration failure: the `fal-gen` catch swallowed the upstream
  error into a generic `"failed"` marker (the audit's 48/48 opaque failure). Now
  surfaces the error in a `.error` blob. `RealFalAdapter` boundary tests
  (4xx / FAILED / no-image / timeout).
- **123** — `DEV_FAL_FALLBACK` was gated on `!FAL_API_KEY`, so the dev
  `.env.local` (which sets a key) always picked `RealFalAdapter` → 100% image
  failure against synthetic LoRA keys. Now **flag-only** via `selectFalAdapter()`
  in `src/lib/dev-bypass.ts`.
- **124** — Honest `DEV_DEMO_SEED`: `generateRealBedtimeBook()` in
  `src/dev/seed-maya-world.ts` drives the real pipeline (Claude text +
  DEV_FAL_FALLBACK images). `dev:paid` script wires `DEV_DEMO_SEED` +
  `DEV_FAL_FALLBACK` + `DEV_LIVENESS_BYPASS`.
- **125** — Likeness-confirmation gate. `likeness_confirmed` **persisted**
  (migration 011) + read/written on the Supabase round-trip; gate uses `!== true`
  so legacy/undefined rows block too. `acceptLikeness` is Guardian-only. Mobile
  route `POST /api/personas/[id]/accept-likeness`.
- **126** — Deterministic R1 smoke (`tests/126-r1-smoke.test.ts`) at the service
  seam + `e2e/r1-smoke.spec.ts` for the live dev server.

### Track B — iOS legal gate (127-131)
- **127** — Email-send failure → consent NOT granted, retryable; receipt audit.
- **128** — Purchase/trial failure → entitlement does NOT flip; restore-purchases.
- **129** — R1 one-plan collapse via `R1_ONE_PLAN` flag; `GET /api/paywall-config`;
  mobile `billing.tsx` fetches it (was hardcoded to two plans).
- **130** — Jurisdiction engine config-driven for US + IN; adding a market is
  config-only; per-market legal-review checklist launch gate
  (`CONTEXT/docs/adr/r1-market-legal-review-checklist.md`).
- **131** — First-open flow: demo → signup → paywall → consent → photos.

### Track C — keepsake, safety, release (132-135)
- **132** — PDF export keepsake (text + images); graceful text-only PDF when
  images missing; rejects non-finalized.
- **133** — Moderation fails closed on the generation path.
- **134** — Hard-delete always available (never subscription-gated).
- **135** — Secrets audit + Apple App Review packet
  (`CONTEXT/docs/adr/apple-app-review-packet.md`).

## Red-team pass (the important part)

A fresh-eyes checker attacked the diff against the invariants and found 5 real
bugs. All fixed test-first before merge:

1. **BUG 1 (CRITICAL):** likeness gate was a **no-op in prod** —
   `likenessConfirmed` wasn't persisted to Supabase, so every hydrate read
   `undefined` and the gate (`=== false`) never fired. Fix: migration 011 +
   read/write on the round-trip (`src/db/supabase-store.ts`) + gate tightened to
   `!== true` + Supabase round-trip regression test
   (`tests/supabase-store.test.ts`). The in-memory test store masked this.
2. **BUG 2:** R1 one-plan not wired to mobile — `billing.tsx` hardcoded both
   plans. Fix: `/api/paywall-config` route + mobile fetches it.
3. **BUG 3:** no mobile `acceptLikeness` route. Fix:
   `POST /api/personas/[id]/accept-likeness` + `mobile/lib/api.ts` helper.
4. **BUG 5:** `.error`/`.moderation` diagnostic blobs were client-servable via
   the images route. Fix: restricted to illustration/video extensions
   (`src/app/api/images/route.ts`).
5. **BUG 6:** `acceptLikeness` had no Guardian-role check. Fix: added.

## Test state

- **453 tests pass** (96 files). New tests: `tests/122-*.ts` through
  `tests/135-*.ts` + `122b-images-route-gate` + `129-125-mobile-api-gates`.
- Server `tsc --noEmit` clean. Mobile `tsc --noEmit` clean.
- Lint: my files are clean (pre-existing `any` errors in `tests/12-hard-delete.test.ts`
  are unrelated).

## In-flight, NOT mine (do not discard)

At session end the working tree had uncommitted/untracked artifacts from a
**separate planning session** (PRD v16/v17 — "ruthless cut" + test/observability).
These are **not** part of PR #82 and were left untouched:

- Modified `CONTEXT/CONTEXT.md` — adds v16/v17 glossary language.
- Untracked: `CONTEXT/planning/prd-v16-r1-ruthless-cut.md`,
  `prd-v17-test-framework-and-logging.md`, `r1-simplify-test-logging-invariants.md`.
- Untracked issues `145-cut-audio-from-r1.md` through `155-mobile-expo-e2e-core-loop.md`.

The next agent should treat these as in-progress planning and either continue or
commit them separately. They were intentionally excluded from PR #82.

## Honest follow-ups (flagged, not fixed)

- `checkGeneratedImageBytes` CSAM path lands the page as `failed` not
  `quarantined` — acceptable for blocking; surface CSAM distinctly later.
- `acceptLikeness` is accept-only (no retrain/reject path) — deferred to R2.
- `e2e/r1-smoke.spec.ts` needs a running `dev:paid` server; the deterministic
  `tests/126-r1-smoke.test.ts` pins the same invariants without a server.

## Next

- **PRD v15 (UI polish, issues 136-144)** — not started. Planning + screenshots
  are in PR #81. Start at issue 136 (centralize touch feedback + haptics in
  `maya-ui`). UI snapshots in `CONTEXT/ui-snapshots/`.
- **PRD v16/v17** — in-progress in the working tree (see above).

## Suggested skills

- `/part2` — pick the next unblocked issue (136 for UI, or a v16/v17 issue).
- `/loop-engineer` — run the next issue as a closed maker→checker loop.
- `lullabook-design` + `lullabook-design-check` — required for PRD v15 UI work.
