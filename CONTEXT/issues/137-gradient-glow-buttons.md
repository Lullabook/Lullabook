# 137 — Gradient + glow buttons (restore the brand's intended richness)

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-A.

## What to build
Replace the flat `PrimaryButton` fill (`maya-ui.tsx:115`) with the brand spec's **135° purple
gradient + colored glow** (`expo-linear-gradient`), plus an **amber secondary** variant. This
is the single biggest "feels cheap vs premium" fix and is on-brand (the port dropped it).
Runtime fallback to the flat token if the lib is unavailable (no red-screen — cf. expo-av).

## Acceptance criteria
- [ ] `PrimaryButton` renders gradient + glow per the brand spec; amber secondary variant exists.
- [ ] Graceful flat fallback if `expo-linear-gradient` is unavailable.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
136
