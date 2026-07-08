# 128 — RevenueCat IAP: trial start + server-authoritative entitlement
Status: shipped
Apple IAP via RevenueCat: 7-day trial, Household-level entitlement flipped server-side on purchase (webhook/receipt verification), restore-purchases supported, verified in IAP sandbox.
Invariant: entitlement is the server-side source of truth, client UI never trusted; purchase failure never flips entitlement; entitlement check < 300ms.
(condensed 2026-07-07 — full spec in git history)
