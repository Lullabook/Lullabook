# 80 — Wire remaining stubbed mobile handlers

Triage: ready-for-agent

## What to build
Close out the parity backbone: the mobile screens that still have TODO/stub handlers
get wired to the real Bearer API. Independent of the Journal/Storybook threads.

- `characters/[id].tsx` — **fetch** the Character by `id` and pass its questionnaire as
  `initial` to the edit form (remove the `TODO: fetch the character` stub); save → update.
- `family/new.tsx` — submit creates a real roster member / persona via the existing
  create endpoints (the screen already has `expo-image-picker`); handle the
  training/`ready` lifecycle copy.
- `account.tsx` — replace the `Alert.alert` placeholder with real account read +
  hard-delete (`hardDeleteAccount()` already exists in `mobile/lib/api.ts`), with the
  confirmation gate.
- Add any missing typed clients to `mobile/lib/api.ts` (e.g. get/update Character).

## Acceptance criteria
- Editing a Character on the Simulator loads its existing values and saves changes.
- Creating a family/roster member persists and reflects training state.
- Account hard-delete runs the real confirmation → deletion flow.
- No remaining `TODO`/`Alert.alert` stub handlers in the wired screens.

## Blocked by
Nothing (existing endpoints). Can run in parallel with the Journal/Storybook threads.
