# Session Handoff — 2026-06-23: /part2 Track C — PRD v13 "Pricing" (issues 116–121)

Status: historical

Shipped ADR-0025 two-plan model (116–121): `Plan` type + `PLAN_ENTITLEMENTS`,
per-member create-rights gate `requireCanCreate`, Story cap enforced in generate path,
credit ledger persisted to DataStore, two-plan paywall UI, trial/webhook mapping with
inherit-on-login. 397 tests green, web+mobile tsc clean.

- Still binding: login cap is distinct from likeness cap; create-rights resolved
  server-side from plan+role (actor from verified JWT); story cap idempotent, failed
  generations don't count; webhook activation idempotent + Household-keyed
  (`app_user_id = familyId`).
- Two-plan paywall later collapsed to solo plan(s) by issue 146 / R1_ONE_PLAN.

(condensed 2026-07-07 — full text in git history)
