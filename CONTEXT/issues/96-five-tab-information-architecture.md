# 96 — 5-tab information architecture (retire the flat "More")

Status: shipped

Replaced the flat Home + catch-all "More" tab with the 5-tab IA: **Home / Stories /
Create / Family / Settings** (web+mobile parity); the "More" route was removed and all
its content relocated (Stories shelf, Create flow, Family roster+Characters,
Settings/account/subscription).
Invariant: unknown/legacy deep links must resolve/redirect, never a white screen (guards
the macOS-dupe-file Unmatched-Route regression class). This tab structure held through
the later Maya's World restyle (175).

(condensed 2026-07-07 — full spec in git history)
