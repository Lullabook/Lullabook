# 02 — Subscription + consent gate (payment-VPC)

Status: superseded by 92-revenuecat-iap-trial-vpc.md
Introduced the config-driven `ConsentEngine` (allow/deny by jurisdiction+actor+action) and consent-receipt storage; gated Baby Persona creation on active paid status + recorded consent. Billing rail (Stripe subscription) was later replaced by RevenueCat IAP 7-day trial-as-VPC (92) and further tier changes (116, 129), but the core invariant persists unchanged: no child likeness without a paid/VPC gate plus a consent receipt.
(condensed 2026-07-07 — full spec in git history)
