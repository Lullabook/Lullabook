# 34 — Household + multiple babies + per-baby World

## What to build
Introduce **Household** as the account/billing/consent boundary (reframing the old
`Family`=account) and allow it to own **multiple Babies**, each with its own **World**
surface. Migration adds a `babies` table (household_id, name, nicknames defaults) and
a household concept; keep `family_id` plumbing working via an alias/compat shim so
existing services don't break. World home reads the selected baby from real data.

## Acceptance criteria
- A Household can have ≥1 Baby; default Baby selected; a baby switcher exists.
- Migration is additive + reversible; existing 33-issue tests stay green.
- World home renders the real selected Baby (name/initial/counts) not mock data.
- Adding a baby supports "same family" (default, shares roster) vs "different family".

## Blocked by
(none — foundation)
