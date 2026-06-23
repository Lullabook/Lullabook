# 139 — Skeleton loaders + illustrated empty states

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-A.

## What to build
A reusable shimmer **Skeleton** card (mirrors final layout) replacing the bare
`ActivityIndicator` loading branches (`index.tsx:36`, `stories/index.tsx:50`, …), and
**illustrated empty states** (large emoji + CTA) replacing one-line gray text
(`family.tsx:77`, `stories/index.tsx:75`).

## Acceptance criteria
- [ ] Loading branches render skeletons immediately (no blank/spinner flash).
- [ ] Empty states are illustrated + actionable (CTA), not gray one-liners.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
—
