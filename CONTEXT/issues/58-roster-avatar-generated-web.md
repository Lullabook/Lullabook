# 58 — Roster avatar: generate from LoRA, render everywhere, never the raw photo (web)

Triage: ready-for-agent

Implements [ADR-0020](../docs/adr/0020-roster-avatar-generated-not-raw-photo.md).

## What to build
Every roster member (Baby + adult) is displayed via a **generated Roster avatar**
rendered from their likeness LoRA — never their raw uploaded photo.

- Data: add a nullable `avatarKey` to the persona/member record (migration: additive,
  reversible). `null` ⇒ render a neutral placeholder.
- Generation seam (`src/services/persona.ts`): extend the `trainWithRetry` **`ready`**
  branch — after status flips to `ready`, render one clean portrait through the
  existing image pipeline using the new LoRA, store it under the Family-scoped blob
  key space (so hard-delete/purge erases it — ADR-0007), and persist `avatarKey` on
  the member. Replace the stubbed `getLikenessSamples` `example.com` URL with the real
  avatar resolution (signed URL from the stored key).
- Display: render the Roster avatar (or, when `avatarKey` is null / status is
  `training`|`failed`, the placeholder — gradient circle + Baloo 2 initial per the v2
  design system) **everywhere a member's picture appears**: World, Family roster,
  story credits, member pickers. Remove/replace any raw-photo `<img>` on a display
  surface.
- Privacy invariant: no display surface may load a raw uploaded photo. The
  `lullabook-design-check` skill flags this — keep it green.

## Acceptance criteria
- A newly added member shows the placeholder while `training`, then their generated
  Roster avatar once `ready`.
- No raw uploaded photo is rendered anywhere in the web UI for any member, Baby
  included; a grep for the photo key path on display surfaces returns nothing.
- The avatar blob is erased by the existing hard-delete/purge path (ADR-0007).
- Likeness training, LoRA, and consent are unchanged (ADR-0001/0002/0008 untouched).
- New tests cover: avatar generated + `avatarKey` set on `ready`; placeholder when
  null/training; avatar erased on purge. Existing tests stay green.

## Blocked by
57 (need a working blob store to store + serve the avatar locally)
