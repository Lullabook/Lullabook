# 137 — Gradient + glow buttons (restore the brand's intended richness)
Status: shipped
Replaced the flat `PrimaryButton` fill with the brand spec's 135° purple gradient + colored glow (`expo-linear-gradient`), plus an amber secondary variant.
Invariant: runtime fallback to the flat token if `expo-linear-gradient` is unavailable (no red-screen, same pattern as the expo-av handling).
(condensed 2026-07-07 — full spec in git history)
