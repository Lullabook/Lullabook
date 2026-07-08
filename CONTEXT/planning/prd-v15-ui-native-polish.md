# PRD v15 — UI native polish (Apple-grade craft, Maya's World warmth)

Status: shipped (issues 136-144).

Still-binding brand rules:
- Keep **emoji iconography** — no SF Symbols swap; Baloo 2 / Nunito, cream/purple/amber
  tokens are deliberate.
- Presentation-only wave — no domain/behavior change; every screen passes
  `lullabook-design-check` (tokens, type, radius, shadow); hit targets ≥44×44pt,
  Dynamic Type, WCAG AA contrast, reduce-motion honored.
- Gradient/blur/haptics libraries must degrade gracefully if unavailable at runtime
  (never a red-screen crash).

(condensed 2026-07-07 — full text in git history)
