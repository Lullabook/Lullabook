# 166 — Iconography + navigation polish (Back button, role-correct symbols)

Triage: ready-for-agent

## Parent
PRD v19 — `CONTEXT/planning/prd-v19-working-core-loop.md`. QA: the Back button "doesn't look
good" and the tab-bar / feature symbols "look random / placed in a hurry." Make the symbol
set meaningful and role-correct, and bring the Back control onto the canon design system.

## What to build
1. **Back control.** Restyle the shared Back button (used on `family/new.tsx`,
   `billing.tsx`, `stories/[id].tsx`, etc.) to the Maya's World canon (pill radius,
   plum-tinted shadow, dusk-purple token) — run the `lullabook-design` tokens; no ad-hoc
   `‹ Back` styling. One shared component, consistent everywhere.
2. **Role-correct symbol system.** Audit every emoji/symbol on the primary surfaces (tab bar
   Home/Stories/Create/Family/Settings; Create story-type pills; World home cards; roster).
   Replace hurried/duplicative glyphs with a coherent, meaningful set (each symbol maps to
   its role and is distinct from its neighbours). Coordinate the Bedtime/Learning pair with
   issue 164. Document the chosen set inline so it is not re-randomized later.
3. **Design-check.** Run `lullabook-design-check` on the touched surfaces and snap any drift
   back to canon tokens.

## Acceptance criteria
- [ ] Back control uses the canon token set (color/radius/shadow) and is a single shared
      component; no per-screen ad-hoc styling remains.
- [ ] Every primary-surface symbol is role-correct and distinct from its neighbours; no
      duplicate/placeholder glyph (e.g. no two tabs sharing a look).
- [ ] `lullabook-design-check` reports no drift on the touched files.
- [ ] Mobile typecheck clean; `npx eslint mobile` 0 app errors; existing suite green.

## Verification-command
```bash
npx vitest run tests/166-iconography-back-button.test.ts && npm run verify
```

## Blocked by
_none_
