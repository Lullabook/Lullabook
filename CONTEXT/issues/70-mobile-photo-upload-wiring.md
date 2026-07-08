# 70 — Finish mobile photo-upload wiring (prerequisite)

Status: shipped

Closed the native-iOS gap: mobile add-family `submit()` was TODO-wired; wired the
photo-upload path end-to-end to the backend blob store (roster reference photos, and
later Moment photos). Fix landed via `mobile/lib/form-data.ts` (`NativeUploadFile` /
`appendNativeFile`, RN multipart parts not web Blobs) after Simulator bugs B1/B2; see
PRD v11 addendum. Invariant preserved: no raw uploaded photo is ever rendered on mobile
(ADR-0020/0021). Foundational prerequisite for issue 71.

(condensed 2026-07-07 — full spec in git history)
