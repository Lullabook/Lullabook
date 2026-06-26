# 146 — Cut multi-family: solo Guardian, one baby, solo plan only

Triage: ready-for-agent

## Parent
PRD v16 — `CONTEXT/planning/prd-v16-r1-ruthless-cut.md`. Track S2. Amends ADR-0024; refines issue 129.

## What to build
Collapse R1 to a **single solo Guardian with one baby**. Disable multi-member collaboration
**server-side**: family-invite, invited-member, and voice-message endpoints return a clean
`404`/`403`. Create-rights default to **solo-Guardian-only**. Enforce **one baby per Household**
server-side. The paywall sells **solo plan(s) only** — the collaborative "Our Whole Family" plan
is not shown or sellable (this subsumes and finalizes issue 129; solo tier count is config). Keep
the multi-member + two-plan code behind config for R2.

## Acceptance criteria
- [ ] Family-invite / invited-member / voice-message endpoints are **disabled server-side**
      (clean `404`/`403`, never 500) — cutting multi-family **closes** authz, not opens it.
- [ ] Create-rights resolve **server-side** to solo-Guardian-only; a non-Guardian/invited path
      cannot generate.
- [ ] One-baby-per-Household enforced server-side; multi-baby UI not reachable.
- [ ] Paywall (web + mobile) renders **solo plan(s) only**; the collaborative plan is not shown
      or sellable; no entitlement regressions; multi-member code remains behind config for R2.
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
npm test -- 146-solo-only && npm test -- paywall && (cd mobile && npx tsc --noEmit)
```

## Blocked by
_none_
