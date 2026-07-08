# 166 — Iconography + navigation polish (Back button, role-correct symbols)

Status: shipped

Restyled the shared Back button (used on `family/new.tsx`, `billing.tsx`, `stories/[id].tsx`,
etc.) onto Maya's World canon (pill radius, plum-tinted shadow, dusk-purple token) as one shared
component — no ad-hoc `‹ Back` styling anywhere. Audited every emoji/symbol on primary surfaces
(tab bar, Create story-type pills, World home cards, roster) and replaced hurried/duplicative
glyphs with a coherent, role-correct, non-duplicative set; coordinated the Bedtime/Learning pair
with issue 164. `lullabook-design-check` passes on touched surfaces.

(condensed 2026-07-07 — full spec in git history)
