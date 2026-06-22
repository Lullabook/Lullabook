# 103 — Mobile nav: nested stack-in-tab so tabs persist (kill the Redirect shims)

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track A.

## What to build
3 of 5 tabs (`stories.tsx`, `create.tsx`, `settings.tsx`) are `<Redirect>` shims that jump
**out** of the `(tabs)` navigator to root-stack siblings — so the tab bar disappears and
the selected tab never persists. Restructure each tab to own a **nested Stack** (e.g.
`(tabs)/stories/_layout.tsx` + `index`/`[id]`); move the target screens under their tab;
delete the shims. (Consult Expo SDK 56 expo-router docs — `mobile/AGENTS.md`.)

## Acceptance criteria
- [ ] Tapping any tab lands on a real screen **within `(tabs)`**; the tab bar never
      disappears and the active-tab highlight persists.
- [ ] No content is reachable both as a tab and a root-stack sibling.
- [ ] Drill-downs keep the tab bar mounted; back stays inside the tab.

## Verification-command
```bash
cd mobile && npx tsc --noEmit && test -z "$(find . -name '* 2.*' -not -path '*/node_modules/*')"
```

## Blocked by
(none)
