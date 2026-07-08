# 121 — Trial-of-Family + RevenueCat/Stripe product mapping + inherit-on-login
Status: superseded by 128-revenuecat-iap-trial-entitlement.md
Mapped one Stripe price + one RevenueCat product per plan; a 7-day card trial (=VPC) activated the full Our-Whole-Family experience; invited Members inherited the Household entitlement on login (app_user_id = familyId); cross-rail de-dup was last-write-wins.
Superseded — R1 replaced the dual Stripe/RevenueCat mapping with pure RevenueCat IAP entitlement (128); invited-member inheritance is also moot post-146 (solo-only).
(condensed 2026-07-07 — full spec in git history)
