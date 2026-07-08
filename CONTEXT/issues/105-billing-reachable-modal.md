# 105 — Billing as a reachable modal

Status: shipped

Fixed `billing.tsx`/`modal.tsx` being orphaned routes (no layout registration, no
`presentation: "modal"`) with no route ever navigating to `/billing` — upgrade CTAs only
called `setNotice` and did nothing. Registered `billing`/`modal` with
`presentation: "modal"` and wired `router.push("/billing")` from upgrade CTAs.

(condensed 2026-07-07 — full spec in git history)
