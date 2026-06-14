# 59 — Update / replace reference photos → retrain → regenerate avatar (web)

Triage: ready-for-agent

## What to build
A roster member's reference photos must stay editable even though they are never
displayed. Provide an "update reference photos" action that swaps the stored photos,
re-runs likeness training, and regenerates the Roster avatar.

- Service (`src/services/persona.ts`): a `replacePhotos(personaId, newPhotos)` path
  that re-runs the same child-safety + preflight checks, replaces the stored photos
  under the member's blob keys, sets status back to `training`, clears `avatarKey`
  (so the placeholder shows during retrain), starts a new fal training job, and on
  `ready` regenerates the avatar via the issue-58 seam.
- UI: an "Update photos" affordance on the member's edit screen — a dashed upload zone
  (v2 design system, per `lullabook-design`), **not** a gallery of the current photos
  (the raw photos are still never displayed). Show "N photos on file · Replace" rather
  than thumbnails of them.
- Auth/ownership: same checks as creating the member; guardians for a Baby, self for
  an Adult persona (consistent with existing rules).

## Acceptance criteria
- Replacing a member's photos re-enters `training`, shows the placeholder, and on
  completion shows a freshly regenerated avatar.
- The raw photos are never rendered during or after the update flow.
- Old photo objects are replaced (not orphaned) under the member's key space; purge
  still erases everything.
- New tests cover replace → training → regenerated avatar, and that the update flow
  surfaces no raw-photo display. Existing tests stay green.

## Blocked by
58 (avatar generation seam + `avatarKey`)
