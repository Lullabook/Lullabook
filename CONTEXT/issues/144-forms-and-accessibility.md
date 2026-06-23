# 144 — Keyboard handling, animated controls & accessibility pass

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-C.

## What to build
Add `KeyboardAvoidingView` to `Screen` (forms: `family/new.tsx`, `daily.tsx`, `create`, dev
sign-in block). Animate the billing **segmented toggle** (`billing.tsx:124`) and the consent
**checkbox** (`family/new.tsx:202`) — real 44pt targets, spring check. Run an **accessibility
pass**: ≥44pt hit targets, **Dynamic Type** (`allowFontScaling` strategy + test), WCAG-AA
contrast (fix borderline `C.soft` body text on tint).

## Acceptance criteria
- [ ] Form content lifts above the keyboard; segmented toggle + checkbox animate; all touch
      targets ≥ 44×44pt.
- [ ] Text supports Dynamic Type; contrast ≥ WCAG AA.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
136
