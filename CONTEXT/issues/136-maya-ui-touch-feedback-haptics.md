# 136 — Centralize touch feedback + haptics in maya-ui

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-A.

## What to build
Centralize interaction in `mobile/components/maya-ui.tsx`: `Pressable` render-prop (opacity
~0.85 + spring `scale(0.97)` via the already-installed `react-native-reanimated`) + `hitSlop`
on `PrimaryButton`/`GhostButton`/`Chip` and the shared card rows. Add `expo-haptics`:
`impactAsync(Light)` on primary CTAs / chip toggles / tab switches; `notificationAsync(Success)`
when a story finishes generating / training starts. Every screen inherits polish for free.

## Acceptance criteria
- [ ] All shared maya-ui pressables + card rows show press feedback (opacity + spring scale)
      and fire haptics.
- [ ] Haptics **no-op when unavailable**; reduce-motion respected; press latency < 50ms at 60fps.
- [ ] Passes `lullabook-design-check`; emoji/brand identity unchanged.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
—
