# 27 — Curation + library + immersive reader + offline

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

The native curate-and-keep experience. A parent resolves a generated draft
(failed/quarantined Pages appear as **re-rollable holes**, free to retry; chosen
re-rolls spend the **re-roll budget**), picks among Page **candidates**, re-rolls
text or illustration independently, and **finalizes**. Finalized books live on a
native **library shelf** with an immersive **page-turn reader**, available
**offline** (Page text + illustration bytes cached locally on first open via
`expo-file-system`). Reuses the existing curation services through Bearer routes.

## Acceptance criteria

- [ ] A failed/quarantined Page renders as a **re-rollable hole** and recovery
      regeneration is **free**; a parent-initiated re-roll **decrements** the
      budget (free-recovery vs paid re-roll, ADR-0004).
- [ ] A parent can pick among Page **candidates** and re-roll text/illustration
      independently; a parent can **finalize** a draft.
- [ ] **Bug fix (recover a `failed` book):** `finalizeStorybookStatus` can move a
      recovered book to `draft` (no early-return that strands it `failed`).
- [ ] **Bug fix (candidate blob key):** a selected re-roll candidate is read back
      via `illustrationBlobKey` (not `illustrationUrl`) by the reader and export,
      and respects moderation.
- [ ] **Bug fix (`pageRecover` terminal handler):** an exhausted page recovery has
      a terminal-failure handler (renders as a hole, not an infinite/orphan state).
- [ ] Native **library shelf** + immersive **page-turn reader**; finalized books
      are readable **offline** from the local cache.
- [ ] Tested at the curation service seam with fakes; extend `06-generate-storybook`
      isolation/recovery and `04`/curation prior art.

## Blocked by

- [26 — Email-Plus VPC + Baby Persona + first illustrated Storybook](./26-native-email-plus-vpc-baby-persona.md)
