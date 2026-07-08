# PRD v3 — Native iOS app (Expo / React Native) over the existing backend

Status: shipped — iOS (`mobile/`) is now the shipping platform (ADR-0018); web
stays backend-only.

Still-binding rules:
- Apple Guideline 3.1.1 forces Apple IAP for in-app subscriptions (no Stripe checkout
  in-app); Apple IAP never reveals payer identity, so **Email-Plus VPC** is the
  payment-independent consent mechanism gating Baby Persona creation on iOS.
- Native app authenticates every server call via **Bearer JWT** (`requireBearerMember`,
  verified against Supabase JWKS), reusing existing services/RLS unchanged.
- `mobile/` shares **types only** from `src/domain/types.ts` (compile-time alias) —
  zero runtime coupling to backend code.
- Email-Plus VPC mechanics: attest guardianship → version-stamped consent email link →
  confirm → `consent_verified` + receipt → delayed second email with a **revoke link**.
- Raw child photos are write-only, never rendered; likeness leaves the device only via
  user-initiated Export.

(condensed 2026-07-07 — full text in git history)
