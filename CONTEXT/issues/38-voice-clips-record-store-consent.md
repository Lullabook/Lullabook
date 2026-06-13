# 38 — Voice clips: record, store, consent (recorded only, no cloning)

## What to build
In-app **audio recording** per Family member: capture short clips (label + transcript +
duration), store bytes in the blob store, attach to the member. Capture **voice consent**
per person (voice = biometric) with a **revoke** path that purges clips. Reader/Family
panel playback.

## Acceptance criteria
- Record → upload → playback round-trips for a Family member's clip.
- Voice-consent recorded before clips persist; revoke purges clips + audit retained.
- Hard-delete removes voice clips (extends issue 12 propagation).

## Blocked by
35
