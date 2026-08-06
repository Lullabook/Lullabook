# 214 — Remove every user-visible trace of the internal codename

Triage: ready-for-agent

## Parent

PRD v23 — `CONTEXT/planning/prd-v23-full-likeness-demo.md`.
Real-provider umbrella: GitHub issue #136.

## What to build

"Maya's World" was an internal codename for the design tokens. Audit every user-visible string, screen title, document title, and app metadata value, and make sure the product reads as Lullabook. The demo seed character named Maya is a character name and stays.

## Acceptance criteria

- [ ] No user-visible string in the app or mobile bundle contains `Maya's World` as a brand or product name (D11).
- [ ] App name, document titles, and native display name all read `Lullabook`.
- [ ] A test asserts the absence of the codename in user-visible strings, so a regression fails the suite.
- [ ] The demo seed character named `Maya` is preserved and is documented in the test as an intentional exception.
- [ ] Internal token file names and code comments may keep the codename; only user-visible text is changed.

## Verification-command

```bash
npx vitest run tests/214-branding-audit.test.ts && npm run verify
```

## Blocked by

none

## Invariants restated

none

## Notes

Small ticket. It exists because the Guardian asked why the product appeared to have two names.

**Target backend:** Local dev.
