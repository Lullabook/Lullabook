# 10 — Sharing finalized Storybooks (revocable links)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0013

## What to build

Finalized Storybooks are visible to all Family Members. A Member can also share a
finalized Storybook outside the Family by minting a **revocable Share link**:
non-indexed, with optional expiry/passcode, gated behind a one-time warning that
the link exposes the child's likeness and name. Revocation is immediate.

## Acceptance criteria

- [ ] All Family Members can view a finalized Storybook; drafts remain creator-only.
- [ ] Minting a Share link produces a non-indexed URL (no-index headers) with optional expiry/passcode.
- [ ] A likeness-exposure warning is shown before external sharing.
- [ ] Revoking a link immediately blocks access via that link.
- [ ] `SharingService` tested for visibility rules, mint, expiry, and revoke.

## Blocked by

- 07 — Curate draft
