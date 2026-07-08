# 145 — Cut audio from R1 (voice clips, messages, lullaby weave, narration)
Status: cut
Removed all audio from the R1 surface: voice clips, voice messages, the lullaby-ending weave, AI narration. Removed record/play UI from mobile; voice-related API routes disabled server-side.
Invariant (failure-mode): voice endpoints return a clean 404/403 — never run, never 500; deferred = absent, not error. Audio code kept behind config for an R2 flag re-enable, not deleted; storybook generation/reader work end-to-end with audio absent.
(condensed 2026-07-07 — full spec in git history)
