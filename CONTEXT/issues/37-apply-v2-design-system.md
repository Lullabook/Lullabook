# 37 — Apply the v2 "Maya's World" design system to the real app

## What to build
Make the cream/Baloo 2 + Nunito design (`src/app/world/page.tsx` prototype) the real
authed shell, replacing the dark bedtime theme. Extract shared tokens (colors, type,
nav, cards) and apply to the real authed routes; keep the top nav World/Stories/Create/
Family/Characters.

## Acceptance criteria
- Authed app renders in the warm daytime system (not the old dark theme).
- Shared design tokens/components are reused (not duplicated inline everywhere).
- All existing authed pages remain reachable and functional.

## Blocked by
34
