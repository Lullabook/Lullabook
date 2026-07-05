# Session Handoff — /part2: issues 160–161 built (PDF Export keepsake)

> Date: 2026-07-05. Type: `/part2` build chain (pick → gate → tdd → red-team → handoff
> → push) on branch `feat/prd-v18-pdf-export`. Completes **PRD v18** (issues 160 and
> 161 — both, per the founder's explicit "finish it all" instruction; normally one per
> run). `/part3` review follows in this same session.

## What was built

**Issue 160 — finalize route + reader CTA** (gate `npx vitest run tests/160-*.test.ts
&& npm run verify` → VERIFY-EXIT:0, red-first: 11/11 failing before code):
- `src/app/api/storybooks/[id]/finalize/route.ts` (new) — thin POST over the existing
  `StorybookService.finalize`; 401 unauthed, 400 (never 500) with the service message,
  `ctx.persist()` on success.
- `finalizeStorybook(id)` in `mobile/lib/api.ts` (bearer via the shared `apiFetch`).
- Reader: "📖 Finalize keepsake" CTA on drafts only; inline canon-styled confirm card
  naming the re-roll lock (E4) — inline card, not `Alert.alert`, because RN-web's
  multi-button Alert is a no-op (dead-button doctrine). Confirm → route → `load()`
  refetch; the client never flips status locally. Failure → retryable error, draft
  untouched.

**Issue 161 — PDF export download + share sheet** (gate `npx vitest run
tests/161-*.test.ts && npm run verify` → VERIFY-EXIT:0, red-first: 17/18):
- Deps `expo-file-system@~56.0.8` + `expo-sharing@~56.0.20` (SDK 56 `File`/`Paths`
  API); `expo-sharing` added to app.json plugins.
- `downloadStorybookPdf(id)` in `mobile/lib/api.ts` — bearer fetch of the export
  route (E3), 45s AbortController (E1), `%PDF` magic-byte validation, write to
  `Paths.cache/lullabook-<id>.pdf`, delete-partial-and-rethrow on any failure (E2).
  `expo-file-system` is lazy-imported (native-only module; keeps the web bundle safe).
- Reader: "📕 Export PDF" only when `finalized && canShare`; `canShare` hard-false on
  web (E6). Tap → blocking "Preparing your PDF…" → share sheet
  (`Sharing.shareAsync`, `com.adobe.pdf`) → failure: retryable error, idle button,
  exactly one attempt (guarded).
- Maestro `r1-core-loop.yaml` extended: finalize confirm → "Finalized" → Export PDF →
  share sheet → dismiss.

**Deliberate deviation (disclosed + verified):** both routes use `resolveRequestAuth`
(bearer + cookie) rather than issue 160's literal `getAuthedContext` (cookie-only) —
and the **existing export route was switched too**, because cookie-only auth 401s every
mobile bearer call. The red-team confirmed this is the established mobile pattern
(avatars/images/storybook-GET routes), that the bearer path is JWKS-verified
server-side (`jose.jwtVerify`), and that ownership/RLS checks hold end-to-end.

## Red-team pass (fresh-eyes, separate context): **PASS — no defects**

Attacked, in order: the auth change (E3 boundary — verified not a downgrade), tenant
edges (unauthed / nonexistent / double-finalize / cross-tenant / draft-export — all
correct, proven against the real service+store), E1/E2 client contract (abort covers
body read; delete-on-failure can't mask the real error), E4 (confirm is the only path;
mutation-verified refetch-not-flip), E6 (web can never show the button), E5 canon.
Mutation-tested the new suites: 4/4 mutations went red (500-on-non-draft, web gate
removed, delete-on-failure removed, local status flip). Gates re-run independently:
160+161 suites 29/29, `npm run verify` exit 0 (one unrelated root-typecheck stage
timeout flake on first run, rerun clean), eslint 0 app-source errors.

**Optional hardenings from the checker (→ /part3 candidates, none blocking):**
1. Dev-store cross-tenant existence oracle: RLS error message ("…another family") is
   distinguishable from "not found" in the 400 body (prod store unaffected).
2. Export route has no cross-tenant test of its own (finalize does).
3. Finalize-then-refetch-fails edge: sheet closes onto stale draft UI; re-confirm
   shows a confusing "Only drafts" error. Recoverable, low likelihood.
4. 401 during download shows an inline error; `load()`'s 401 redirects to sign-in.
5. Maestro matchers (partial-text/emoji, share-sheet assertion) unproven until the
   first real Simulator run.

## Honest gaps (recorded, not hidden)

- **Maestro flow unexercised** (no Simulator in this environment); the finalize leg
  consumes the seeded draft, so re-runs need a fresh seed.
- **E1's 30s p95 unmeasured** — the 45s client abort is implemented + guarded, but the
  p95 claim needs a live-device pass.
- Mobile download/share/error paths are pinned by source-guard tests, not RN runtime
  execution — first on-device export is the real proof.
- Share-sheet cancel resolves silently to idle (chosen UX; not in the PRD).
- Cached PDF persists until next export / OS cache purge (E3-compliant; post-share
  delete would be a one-liner if wanted).

## Next

`/part3` review pass over the new surface (this same session), seeded with the five
checker hardenings. After that: live-device sweep (Maestro flow + E1 p95 + real
export on the physical iPhone via the Expo Go setup in the 2026-07-05 part3 handoff).
