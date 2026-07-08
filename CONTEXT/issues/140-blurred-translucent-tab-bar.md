# 140 — Blurred translucent tab bar
Status: shipped
Replaced the opaque tab bar with a translucent blurred bar (`expo-blur`), content scrolls under it (iOS standard); selected-tab emoji icons animate scale/weight instead of opacity-dimming.
Invariant: graceful opaque fallback when `expo-blur` is unavailable; emoji iconography retained (no icon-set swap).
(condensed 2026-07-07 — full spec in git history)
