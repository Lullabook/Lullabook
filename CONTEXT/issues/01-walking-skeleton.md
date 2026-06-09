# 01 — Walking skeleton: auth, Family, empty Persona roster

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v1](../planning/prd-v1.md)

## What to build

The thinnest end-to-end slice that stands up the stack: a user can sign up, an
account is created, a Family is created for them, and they land on a page showing
their (empty) Persona roster. Establishes Next.js + Supabase (Auth + Postgres)
with **row-level security** so a Member can only ever read their own Family's
data. This is the skeleton every later slice hangs off.

## Acceptance criteria

- [ ] A visitor can sign up and log in (Supabase Auth).
- [ ] On first login, a Family is created and the user is its first Member (Guardian role).
- [ ] The roster page lists Personas for the current Family (empty initially).
- [ ] RLS prevents a Member of Family A from reading Family B's rows (integration test).
- [ ] Provider adapter interfaces (Anthropic, fal.ai, moderation, liveness) exist as stubs/fakes for later slices.
- [ ] CI runs the test suite.

## Blocked by

None — can start immediately.
