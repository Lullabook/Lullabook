# 09 — Export finalized Storybook as PDF

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)
- Refs: ADR-0007

## What to build

A Member can export a finalized Storybook as a downloadable PDF that lives on
their device — the durable keepsake that survives cancellation/deletion. Export
is a first-class, always-available action on any finalized Storybook.

## Acceptance criteria

- [ ] A finalized Storybook can be exported to a PDF with all Pages (text + selected illustration candidate).
- [ ] Export is available regardless of subscription state for finalized books (supports cancellation export window).
- [ ] PDF generation tested for a representative finalized Storybook.

## Blocked by

- 07 — Curate draft
