# Session Handoff — 2026-06-21: PRD v12 wave (issues 91–99 + 88 machine parts)

Status: historical

Built the PRD v12 service layer on `feat/wave-prd-v12-89-99`: EntitlementService (91),
RevenueCatPurchaseService (92), StoryCapService (93), CreditLedgerService (94),
CustomStyleService (95), 5-tab IA (96), HomeDashboardService (97), Demo/FirstOpen (98),
paywall-config (99), issue-88 FormData test + runbook checker. 71 files / 352 tests green.

- Binding: services first, HTTP routes/UI are thin follow-ups; gates return structured
  403s; cap/credit enforcement idempotent (replays don't double-count); failed gen never
  consumes slot/credit; hard-delete purges custom Style LoRAs.
- Issues 83–87 are genuinely HITL — cannot be closed by code alone.

(condensed 2026-07-07 — full text in git history)
