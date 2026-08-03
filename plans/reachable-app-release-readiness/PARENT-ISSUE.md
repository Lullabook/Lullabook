# PRD v22 — Reachable app release readiness

This planning issue publishes the complete `/part1` result for the reachable Lullabook iOS app effort. It covers all three planned slices: Story generation reliability, performance optimization, and economics/release readiness.

## Source of truth

- Specification: `CONTEXT/planning/prd-v22-reachable-app-release-readiness.md`
- Ticket drafts: `plans/reachable-app-release-readiness/TICKETS.md`
- Parent Wayfinder map: #133
- Generated context indexes checked with `npm run graph:index -- --check`

## Destination

An ordinary Guardian can use the reachable iOS app without provider credentials, pass server-authoritative consent and entitlement gates, generate a visible Storybook, understand progress/failure, use a responsive app, and reach a release gate backed by deterministic and production-like evidence. Provider spend is bounded, attributable, and stoppable.

## Scope

Sign-in, demo/trial/entitlement, Character and Persona/consent/moderation, Bedtime and Learning Stories, generation/progress/reader/finalize/PDF, Journal/Daily Notes, fal/Anthropic production wiring, performance, RevenueCat lifecycle, spend controls, RLS, Hard-delete, native release evidence, and the Super.Engineering current-workspace Simulator launcher. Audio/video/invitations/Android/Personalized Classics/custom Style LoRA/Share links/new web creation remain out of scope.

## Locked gates

- Provider keys stay server-side; users never supply model credentials.
- `POST /api/storybooks` returns a persisted job in p95 `<2s` without provider work.
- Story text p95 `<25s`; full 12-Page production-like generation p95 `<90s`; cold start p95 `<3s`; page turn p95 `<100ms`.
- Every Story reaches `draft` or `failed`; invalid text fails before image spend; Character-only uses deterministic placeholder art with zero fal calls; selected unconfirmed Personas are rejected.
- Consent, liveness, moderation, signed callbacks, RLS, Hard-delete, and Family ownership are enforced on the production path.
- The `$10` bakeoff and `$2` final provider smoke are separate, fresh-approval gates using synthetic/consenting-adult fixtures only.
- Only deterministic verification is part of the ticket command; missing live/native evidence must report `BLOCKED`, never `PASS`.

## Ticket order

Local ticket IDs 186–197 are dependency-ordered in the ticket draft. The parent issue is an index; implementation work belongs in the child issues. Child issues must be added to the same Project and receive a read-back-confirmed status. Unblocked child roots become `Agent Ready`; dependent children remain `Planned` until their blockers are `Done`.

## Publication gate

No child issue is considered published until it has a GitHub issue URL, is added to Project 1, has a live Status value, and that value is read back. No live provider command is run by this planning handoff. The API keys pasted into chat are compromised and must be revoked/rotated before any canary.
