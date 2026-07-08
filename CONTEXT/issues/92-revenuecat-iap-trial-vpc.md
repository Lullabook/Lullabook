# 92 — RevenueCat Apple IAP + 7-day trial as VPC (ADR-0023, ADR-0018, ADR-0008)

Status: superseded by 121-trial-and-revenuecat-stripe-mapping.md

Shipped the original 3-tier RevenueCat product config + 7-day Normal trial where the
trial's card-on-file is the VPC gate: no baby/Family-member photo upload without a
payment method on file; cached last-known entitlement on RC outage; entitlement check
<300ms.
Replaced by the two-plan Stripe/RevenueCat product mapping (121, ADR-0025), later
refined again for R1 by 128 (simple trial-start + server-flip entitlement). The core
invariant — card-on-file trial = VPC before any child likeness — persisted through both.

(condensed 2026-07-07 — full spec in git history)
