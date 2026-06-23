# 141 — Native large titles in Baloo 2 + resolve dual-title

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-B.

## What to build
Adopt `headerLargeTitle` rendered in **Baloo 2** across stack screens (keep the storybook type,
gain native large-title scroll behavior), and resolve the **duplicate title** problem — the
nav-bar 20px title plus each screen's own 32px in-content `PageTitle` (`_layout.tsx:81`): drop
the in-content `PageTitle` where the large title now covers it.

## Acceptance criteria
- [ ] Stack screens use native large titles styled in Baloo 2; no duplicate title.
- [ ] Back affordance consistent across screens.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
—
