# 136 — Centralize touch feedback + haptics in maya-ui
Status: shipped
Centralized interaction in `mobile/components/maya-ui.tsx`: `Pressable` render-prop (opacity ~0.85 + spring `scale(0.97)` via `react-native-reanimated`) + `hitSlop` on `PrimaryButton`/`GhostButton`/`Chip` and shared card rows. Added `expo-haptics`: `impactAsync(Light)` on primary CTAs/chip toggles/tab switches, `notificationAsync(Success)` on story-finished/training-started.
Naming/convention that binds: "maya-ui" is the shared component module every screen inherits polish from; haptics no-op when unavailable; reduce-motion respected; press latency < 50ms.
(condensed 2026-07-07 — full spec in git history)
