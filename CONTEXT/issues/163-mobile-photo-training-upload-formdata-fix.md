# 163 — Fix mobile photo-training upload ("Unsupported FormDataPart implementation")

Triage: ready-for-agent

## Parent
PRD v19 — `CONTEXT/planning/prd-v19-working-core-loop.md`. Unblocks creating a Baby/Adult
Persona (trained likeness) on device so real likeness can be wired in right after the
placeholder-art core loop (issue 162).

## What to build
1. **Fix the file part.** `mobile/lib/form-data.ts` `appendNativeFile` casts
   `{uri,name,type}` to `Blob`; the Expo SDK 56 / RN 0.85 `FormData` rejects it with
   "Unsupported FormDataPart implementation" at submit (`apiFormData` in
   `mobile/lib/api.ts:24`, used by `createPersona` and `family/new.tsx`). Read the exact
   versioned Expo v56 docs (per `mobile/AGENTS.md`) and repair the multipart part shape so
   `expo-image-picker` assets upload — e.g. correct part construction / `fetch` body, or the
   SDK-56-blessed upload path. No base64-in-memory (I1.3: streamed, ≤10 images).
2. **Failure handling (I2.3).** Unsupported part / network / server 4xx-5xx → a clear
   retryable error in `family/new.tsx`, **no partial Persona** persisted, training not left
   half-started. The consent checkbox + selfie gates stay intact.
3. **Guard test.** A source/unit test that the upload builds a part the RN `FormData`
   accepts (no `Blob`-cast that throws) and that `apiFormData` sends `multipart/form-data`
   with each picked asset present.

## Acceptance criteria
- [ ] On device: Start training with 5 photos + selfie no longer throws "Unsupported
      FormDataPart implementation"; the request reaches `/api/personas` and training queues.
- [ ] I2.3: upload failure → retryable error, no partial Persona, training not half-started.
- [ ] I1.3: ≤10 images, streamed (no full-image base64 held in memory), in-progress state
      within one frame.
- [ ] Mobile typecheck clean; `npx eslint mobile` 0 app errors; existing suite green.

## Verification-command
```bash
npx vitest run tests/163-mobile-formdata-upload.test.ts && npm run verify
```

## Blocked by
_none_
