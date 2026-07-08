# 23 — Native auth end-to-end over a Bearer-authed backend (first TestFlight)

Status: superseded by 81-social-only-auth-apple-google.md

Shipped the `/mobile` Expo app + `requireBearerMember` (Supabase JWT verified via JWKS, resolves the same `RequestContext` as the cookie/web path) — this Bearer-auth backend pattern is foundational and still in use. The sign-in method it built (email+password + Sign in with Apple) was later fully replaced: issue 81 removes email/password entirely, making native sign-in social-only (Apple + Google).

(condensed 2026-07-07 — full spec in git history)
