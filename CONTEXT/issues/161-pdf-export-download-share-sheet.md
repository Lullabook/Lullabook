# 161 — PDF Export: authenticated download + iOS share sheet

Triage: ready-for-agent

## Parent
PRD v18 — `CONTEXT/planning/prd-v18-pdf-export-keepsake.md`. Aha-path step 10 —
delivers the keepsake promise.

## What to build
1. **Deps:** add `expo-file-system` and `expo-sharing` to `mobile/` via
   `npx expo install` (SDK 56-pinned versions; both work inside Expo Go).
2. **Mobile API (`mobile/lib/api.ts`):** `downloadStorybookPdf(id)` — GET
   `/api/storybooks/[id]/export` **with the auth bearer header** (E3), streamed to a
   file in the **app cache directory** (`lullabook-<id>.pdf`). Client-side abort at
   **45s** (E1). Validate the response is a PDF (content-type / magic bytes) before
   returning; on any failure delete the partial file and throw (E2).
3. **Reader UI (`mobile/app/(tabs)/stories/[id].tsx`):** an "Export PDF" button
   visible only when `status === "finalized"` **and** the platform can share
   (`Platform.OS !== "web"` / `Sharing.isAvailableAsync()`) — hidden, never dead (E6).
   Tap → blocking in-progress state on the button (E1, no frozen UI) → on success open
   the native share sheet (`expo-sharing`) with the cached file → on failure show a
   clear retryable error and return the button to idle; the book stays `finalized`
   untouched (E2). No auto-retry loop. Canon styling (E5).
4. **Invariant guards (156-style source tests, same file as the feature tests):**
   the export fetch carries the auth header; the PDF path stays inside the cache
   sandbox and reaches the OS only via `expo-sharing` (no `Linking.openURL`, no
   remote upload — E3); the button is absent on web (E6); failure path deletes the
   partial file (E2).
5. **Maestro:** extend `mobile/.maestro/r1-core-loop.yaml` so the export step (issue
   155's flow) taps finalize → export against the 153 seed, if the flow's current
   state permits; otherwise record precisely what blocks it in the handoff.

## Acceptance criteria
- [ ] E1: p95 < 30s for the ≤8-page seeded book locally; 45s client abort; button
      shows progress, UI never freezes; page-turn budget untouched.
- [ ] E2: server 5xx/timeout/non-PDF → retryable error, idle button, book still
      `finalized`, no partial file left in cache.
- [ ] E3: request authenticated; file only in app cache; egress only via the
      user-initiated share sheet; no new egress path, no share links.
- [ ] E6: no export button on expo-web; no platform where the button renders but
      throws.
- [ ] E5: canon styling; design sweeps pass.
- [ ] Existing suite green; root + mobile typecheck clean; `npx eslint mobile` 0 app
      errors.

## Verification-command
```bash
npx vitest run tests/161-pdf-export-share.test.ts && npm run verify
```

## Blocked by
160
