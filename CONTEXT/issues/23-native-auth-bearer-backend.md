# 23 — Native auth end-to-end over a Bearer-authed backend (first TestFlight)

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

The thinnest end-to-end native slice and the backend enabler every later native
slice rides on. A parent installs the Expo iOS app, signs up / signs in (email +
password **and** Sign in with Apple), and lands on a warm cold-start home that
reads their (empty) Persona/Character roster **through a new Bearer-authenticated
API** — proving the native front-end can reach the existing domain services with
the Supabase JWT as a Bearer token, with **zero duplicated domain logic** and RLS
intact.

Establishes: the `/mobile` Expo app (Expo Router, TypeScript) sharing **types
only** from `src/domain/types.ts` via a `@domain/*` path alias + Metro
`watchFolders`; a `requireBearerMember(request)` backend helper that verifies the
Supabase JWT against the project JWKS (`jose` `createRemoteJWKSet` + `jwtVerify`),
resolves the Member from the `sub` claim, and returns a `RequestContext`
identical to the cookie path (reuse `createRequestContext()`); and the first
Bearer-authed read route the app calls.

## Acceptance criteria

- [ ] `/mobile` Expo app builds and runs in the iOS simulator; imports domain
      **types** (not runtime code) via the `@domain/*` alias; the root web app and
      its 105 tests are untouched and green.
- [ ] A parent can sign up and sign in with **email/password** (Supabase Auth) and
      with **Sign in with Apple**; session tokens are stored in the iOS keychain
      (`expo-secure-store`) and persist across launches.
- [ ] On first sign-in a **Family** is created with the user as its first
      **Member (Guardian)** — identical behavior to web.
- [ ] `requireBearerMember` verifies a valid Supabase JWT and resolves the correct
      Member; a missing/invalid/foreign token is rejected.
- [ ] The app shows a warm **cold-start** home reading the Family's roster via a
      Bearer-authed read route; the route resolves exactly one Member/Family and
      **never crosses Families** (RLS isolation test, extending
      `01-walking-skeleton`).
- [ ] `eas build --platform ios` is configured well enough to produce a
      TestFlight-able development/preview build (human runs the signed build).
- [ ] Tests use a **faked JWT verifier** at the `requireBearerMember` seam; no
      Supabase/Expo SDK internals are tested.

## Blocked by

None — can start immediately.
