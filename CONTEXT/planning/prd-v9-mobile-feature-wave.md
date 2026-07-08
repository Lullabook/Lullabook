# PRD v9 — Native Mobile Feature Wave (Journal + Storybook on device)

Status: shipped.

Still-binding decisions:
- **Sign-in/sign-up is social-only**: Apple + Google via Supabase OAuth. Email/password
  removed entirely from mobile. (Apple Sign-In is mandatory once Google is offered —
  App Store Guideline 4.8.)
- Mobile is a native front-end over existing services (ADR-0018) — "wire, don't
  rewrite"; new server code limited to Bearer API routes mirroring existing web
  actions/services.
- Journal/Firsts are free/tier-agnostic; only Storybook generation touches the
  entitlement gate.
- Every "make this a Story" offer is parent-confirmed before generation spend.

(condensed 2026-07-07 — full text in git history)
