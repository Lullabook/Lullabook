# 29 — Personalized Classics + sharing + export

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

Keepsake breadth and sharing. A parent picks a **Personalized Classic** from the
curated public-domain catalog and has their Personas recast into it (same
illustrated pipeline + Style Bible). A parent mints/revokes a non-indexed **Share
link** (optional expiry/passcode, likeness warning) via the native share sheet,
and **Exports** a finalized Storybook as a PDF shared via the native share sheet.
Reuses existing services (`generateFromClassic`, sharing, export) through Bearer
routes.

## Acceptance criteria

- [ ] A parent can select a **Personalized Classic** from the curated
      **public-domain** catalog only; recasting reuses the illustrated pipeline +
      Style Bible; custom twists pass Brief moderation (ADR-0017, ADR-0010).
- [ ] A parent can **mint and revoke** a non-indexed **Share link** (optional
      expiry/passcode) with a likeness warning, via the native share sheet; revoke
      immediately kills access (ADR-0013).
- [ ] A parent can **Export** a finalized Storybook as a **PDF** and share it via
      the native share sheet.
- [ ] Tested at the service seam (catalog id validation, share mint/revoke, export)
      with fakes; prior art `09-export-pdf`, `10-sharing`, `22-personalized-classics`.

## Blocked by

- [27 — Curation + library + immersive reader + offline](./27-native-curation-library-reader.md)
