# 138 — Pull-to-refresh + remove Refresh button + scroll fixes

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-A.

## What to build
Add `RefreshControl` to the `Screen` scroll view (home/stories/family/daily) and **delete the
literal `↻ Refresh` button** (`(tabs)/index.tsx:165`). Fix the nested `ScrollView` inside
`Screen` on the paywall (`billing.tsx:143`) that breaks scroll/momentum. Bump `BackPill`
(`components/BackPill.tsx`) to a **44pt** hit target.

## Acceptance criteria
- [ ] Pull-to-refresh works on all list screens; the manual Refresh button is removed.
- [ ] Billing paywall scrolls correctly (no nested ScrollView); `BackPill` ≥ 44pt.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
—
