# 163 — Fix mobile photo-training upload ("Unsupported FormDataPart implementation")

Status: shipped

Fixed `mobile/lib/form-data.ts` `appendNativeFile`: `{uri,name,type}`-cast-to-`Blob` was
rejected by Expo SDK 56/RN 0.85 `FormData`. Repaired multipart part construction so
`expo-image-picker` assets upload via `apiFormData` (`createPersona`, `family/new.tsx`) — no
base64-in-memory, streamed, ≤10 images. On failure: retryable error, no partial Persona
persisted, training not half-started; consent/selfie gates intact. Unblocked real-likeness
Persona creation on device.

(condensed 2026-07-07 — full spec in git history)
