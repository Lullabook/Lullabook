# 130 — Multi-jurisdiction engine real for Asia + US (the R1 long pole)

Triage: ready-for-agent

## Parent
PRD v14 — `CONTEXT/planning/prd-v14-r1-release.md`. Track B. ADR-0015.

## What to build
Make the jurisdiction engine **real** for Asia + US: consent method, child-age threshold,
data-residency region, retention/notice — **config-driven per market**, detected/declared at
signup, never hardcoded. Ship a per-market **legal-review checklist** as a launch gate.
⚠️ The R1 long pole; built config-driven so additional markets are a data change.

## Acceptance criteria
- [ ] Jurisdiction detected/declared at signup; consent method + child-age + residency + notice
      resolve from per-market config for **US + ≥1 Asia market**.
- [ ] No jurisdiction value hardcoded; a test proves adding a market is config-only.
- [ ] Per-market legal-review checklist documented + referenced as a launch gate.

## Verification-command
```bash
npm test -- jurisdiction && tsc --noEmit
```

## Blocked by
127
