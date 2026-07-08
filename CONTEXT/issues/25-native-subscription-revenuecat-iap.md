# 25 — Subscription: RevenueCat IAP paywall + webhook → `active` state

Status: shipped

Native paywall (monthly + discounted annual, single `active` entitlement) via RevenueCat IAP; webhook drives the same `SubscriptionService` as the Stripe webhook so web and iOS converge on one server-side `active`/`inactive` flag. Binding invariant that survived every later iteration: illustrated-generation/Persona-creation gates on subscription, text generation never does. Plan shape kept evolving after this (two-plan model in 116, collapsed to one plan in 129, solo-only in 146) — the RevenueCat-webhook plumbing is the durable part.

(condensed 2026-07-07 — full spec in git history)
