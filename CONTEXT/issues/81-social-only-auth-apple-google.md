# 81 — Social-only auth: Login with Apple + Login with Google

Triage: ready-for-agent

## What to build
Replace email/password auth with **social sign-in only** — Apple and Google — on the
native app, via Supabase OAuth. No username/password anywhere in the mobile UI.

- **Remove** email + password fields/flows from `mobile/app/sign-in.tsx` and
  `sign-up.tsx`; rebuild on the Maya's World kit with exactly two buttons:
  **Continue with Apple** and **Continue with Google**.
- **Apple**: `expo-apple-authentication` → Supabase `signInWithIdToken` (provider
  `apple`). Apple Sign-In is mandatory once Google is offered (App Store Guideline 4.8).
- **Google**: Supabase OAuth via `expo-auth-session` / `signInWithIdToken` (provider
  `google`).
- Ensure the Supabase project has Apple + Google providers enabled and the existing
  `auth/callback` mints the same session the Bearer API expects; a Member is created on
  first sign-in exactly as today (no domain-model change).
- Update `mobile/app.config.ts` / entitlements as needed (Apple capability, URL scheme
  for the OAuth redirect).

## Acceptance criteria
- The only ways to sign in on the Simulator/device are Apple and Google; no
  email/password UI remains.
- A first Apple/Google sign-in creates a Member and lands an authenticated session that
  the Bearer API accepts (`/api/home` returns data, not 401).
- Returning sign-in restores the session.
- Manual Simulator pass recorded in the handoff (Apple requires a real device or proper
  Simulator/Apple-ID setup — note any HITL gap).

## Blocked by
Nothing. Foundational but non-blocking (existing auth works for dev); land early.
