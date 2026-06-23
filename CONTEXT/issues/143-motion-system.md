# 143 — Motion system (entrance, animated page-turn, twinkle/float hero)

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-C.

## What to build
Add the reanimated motion the port dropped: card entrance (`FadeInUp`)/layout animations, an
**animated reader page-turn** (replace the instant `setPageIndex` at
`stories/[id].tsx:278-279`), and the brand-spec **twinkling hero star** + gently **floating
book cover** (`lbTwinkle`/`lbFloat`, REFERENCE.md). Honor the reduce-motion setting.

## Acceptance criteria
- [ ] Cards enter with motion; the reader has an animated page-turn; the hero twinkles/floats.
- [ ] 60fps on the UI thread; **reduce-motion** degrades to instant/crossfade.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
136
