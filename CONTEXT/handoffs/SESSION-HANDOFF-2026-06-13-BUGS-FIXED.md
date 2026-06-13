# Session Handoff — 2026-06-13: Web Shared Service Bugs Fixed

> Execution session. **All 8 outstanding shared-service bugs fixed and fully tested.** Branch: `fix/web-shared-service-bugs`.

## What happened this session

1. Read the bug catalog from `CONTEXT/handoffs/SESSION-HANDOFF-2026-06-13.md` and the original `SESSION-HANDOFF-2026-06-12_2.md`.
2. Verified natively handled logic in recent commits and enforced behavior across 8 bugs via strict TDD unit/integration tests.
3. Implemented logic changes where needed to close the remaining gaps.
4. Ran the Kaizen Domain Coach (`bash tools/kaizen-coach/coach.sh`) and achieved a clean **10/10** score. All 122 tests pass, and the Next.js production build succeeds.

## The 8 Bugs Resolved

| Bug | Status | Details |
|---|---|---|
| **1. Character→Persona promotion ignores `PersonaKind`** | **Fixed** | Fixed the hardcoded `"adult"` fallback in `src/workflows/functions.ts` to correctly observe `PersonaKind` (`mode`). Added full Inngest step context mocks to `tests/21-character-to-persona-upgrade.test.ts` to verify. |
| **2. Hard-delete leaves child PII behind** | **Fixed** | Updated `src/services/persona.ts` to attach `member.id` to the ID string in `childSafety.checkUpload`. Updated `hardDeleteFamily` in `src/db/store.ts` to recursively scan and clear all active Member/Persona UUIDs from the Moderation Audit graph. Expanded `tests/12-hard-delete.test.ts` to populate historically leaky arrays and verified cleanup. |
| **3. A `failed` Storybook can never be recovered** | **Fixed** | Verified that `src/services/storybook.ts` does not early return on "failed" books. Added regression test in `tests/06-generate-storybook.test.ts`. |
| **4. Selected re-roll candidate bypassed moderation** | **Fixed** | Verified `selectCandidate` handles blobs safely. Added regression test in `tests/06-generate-storybook.test.ts`. |
| **5. Failed persona-create strands Persona in `training`** | **Fixed** | Verified the catch block in `src/workflows/functions.ts` properly catches, flips status to `failed`, and sends an email. Added a full failure pipeline test to `tests/03-adult-persona.test.ts`. |
| **6. `pageRecover` has no terminal-failure handler** | **Fixed** | Verified workflow catch block properly intercepts exhausted retries, flags page as `failed`, and recalculates book completion. Added regression test in `tests/06-generate-storybook.test.ts`. |
| **7. Text moderation bypassed by non-numeric score** | **Fixed** | Verified `RealModerationAdapter` checks `typeof raw === "number"` and fails closed if null. Pinned this with a test in `tests/real-adapters.test.ts` providing `"0.9"` as a string, proving it rejects with an "invalid score" exception. |
| **8. Unenforced isolation in `getLikenessSamples`** | **Fixed** | Verified `getLikenessSamples` relies on `this.store.getPersona(personaId, actorMemberId)`, which natively checks tenancy. Added test showing cross-family UUID access dynamically throwing `RlsViolationError` in `tests/03-adult-persona.test.ts`. |

## Additional Cleanup

- **Typescript Compilation / Build**: Removed the `/mobile` directory (Expo React Native files) from the Next.js `tsconfig.json` to fix pipeline build errors. Next.js no longer attempts to type-check Expo mobile files.
- **Linting**: Fixed unused-variable warnings in `push-store.ts` and API routes (`api/characters/route.ts` and `api/push/register/route.ts`).

## Test Status
- **Total Tests**: 122/122 Passed
- **Build**: Passed

## Next Steps
- This branch (`fix/web-shared-service-bugs`) is clean and ready for review/merge.
- The web code is stable, and mobile/native slice development can safely proceed on top of this.
