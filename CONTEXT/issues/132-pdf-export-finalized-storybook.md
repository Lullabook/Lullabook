# 132 — PDF Export of a finalized Storybook (the keepsake)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track C. ADR-0007.

## What to build
Export a finalized Storybook to the device as a PDF (text + page images composed; web already
has `pdf-lib`). Mobile share/save sheet. This is the keepsake-survives-deletion mechanism and
the **only** likeness-egress path in R1 (no Share links).

## Acceptance criteria
- [ ] A finalized book exports to a non-empty PDF containing all pages (text + images).
- [ ] Export is user-initiated + local; no network share surface added.
- [ ] Graceful for a text-viewable draft (text-only PDF when images are missing).

## Verification-command
```bash
npm test -- export pdf && tsc --noEmit
```

## Blocked by
—
