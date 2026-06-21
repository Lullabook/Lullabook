# Session Handoff — 2026-06-21: finish issue 91 (Tier & entitlement model, ADR-0023)

> Picking up **issue 91** mid-stream so a **GLM-powered Claude Code** instance can close it out.
> The hard part is done and green; what's left is a doc note + a commit. **Do not rewrite — finish.**
> Issue spec: `CONTEXT/issues/91-tier-entitlement-model.md`. Branch: `feat/wave-prd-v12-89-99`
> (tip `2591818`). All issue-91 work is currently **uncommitted** in the working tree.

## State found (already implemented, working)
- **Service:** `src/services/entitlement.ts` — `EntitlementService`, `Entitlement`, `TIER_ENTITLEMENTS`
  (basic 4/2, normal 8/4, plus 20/∞), `EntitlementError` (status 403), and gates
  `requireEntitled` / `requireCapability` / `requireMemberSlot`. Tier derives from the validated
  subscription; active-but-untiered → `normal`; inactive → `none` (zeroed bundle).
- **Tests:** `tests/91-entitlement-model.test.ts` (test-first, 15 cases) — caps/flags per tier,
  tier derivation, 403 boundary + idempotency for narrate/video/customStyle, member-cap.
- **Gates wired (real 403 boundary, not UI):**
  - `src/services/storybook.ts` — `requireEntitled` + `requireCapability("narrate")` on both
    `generate` and the classic-tale path (a Brief carrying voice clips / lullaby ⇒ narrate gate).
  - `src/services/voice-clip.ts` — `requireCapability("narrate")` before clip upload.
- **DI + type:** `src/lib/context.ts` and `src/test/fixtures.ts` construct `EntitlementService` and
  inject it into `VoiceClipService` + both `StorybookService` instances; `Tier` added to
  `src/domain/types.ts` (+ optional `Subscription.tier`).

## Verification state (measured this session)
- `npx vitest run entitlement` → **15/15 pass**.
- `npx vitest run` (full) → **62 files, 260 tests, all green** — the shared-service wiring caused
  **no regressions**.
- `npx tsc --noEmit` → **fails, but only on pre-existing noise, none in issue-91 files**:
  - `.next/types/...d 3.ts` / `d 4.ts` — macOS/iCloud **duplicate-file** artifacts (the known
    `" 2."/" 3."/" 4."` problem; see the macOS-dupe note in project memory). Not source.
  - Long-standing test-type smells in `tests/03,06,23,54,61,74,77`.
  - **Do not chase these** — they predate issue 91 and are out of scope.

## Remaining work to close issue 91 (small)
1. **Acceptance #4 — `DEV_FORCE_SUBSCRIPTION` "never-ship" doc note.** Currently only an inline
   comment in `entitlement.ts`. Add an explicit note where the project documents dev overrides
   (grep `DEV_FORCE_SUBSCRIPTION` for the existing convention; likely a CONTEXT doc / `.env`
   example header) stating it is dev-only and must never ship.
2. **Leave the deferred seams alone** — they are intentionally out of issue-91 scope:
   - member-slot enforcement is *wired into* `PersonaService.createAdult` by **issue 93**;
   - video capability + credit metering is **issue 94**;
   - custom-style gate is **issue 95**.
   The gate *methods/config* live here (tested directly); the call-site wiring does not.
3. **Commit** the 7 files (`git status` shows: `entitlement.ts`, `91-entitlement-model.test.ts`
   untracked; `types.ts`, `context.ts`, `storybook.ts`, `voice-clip.ts`, `fixtures.ts` modified).

## Verification command (from the issue)
```bash
npm test -- entitlement && tsc --noEmit
```
Expect `entitlement` **green**; the `tsc` failures are the pre-existing noise above — judge
issue 91 by the entitlement suite + the green full run, not by a clean `tsc`.

## Suggested skills
- `/part2` — execute the remaining checklist above on issue 91 (TDD already satisfied; this is the
  red-team + close-out + commit), then continue to the next unblocked issue.
- `/push-handoff` — after committing, push the branch and open/update the PR.
