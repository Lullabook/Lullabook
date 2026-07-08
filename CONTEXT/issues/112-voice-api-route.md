# 112 — Voice API route over VoiceClipService
Status: cut
Added a Bearer-authed voice route surface (upload/list/signed playback URL/revoke) over the already-built VoiceClipService; consent + narrate-capability 403 gates preserved; clip required server-validated transcript + durationSecs.
Cut for R1 — 145 disables all voice endpoints server-side (clean 404/403, never run); code kept behind config for R2.
(condensed 2026-07-07 — full spec in git history)
