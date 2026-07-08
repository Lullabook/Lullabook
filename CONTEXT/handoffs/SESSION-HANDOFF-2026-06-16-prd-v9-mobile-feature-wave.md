# Session Handoff — 2026-06-16: `/part1` PRD v9 (native mobile feature wave)

Status: historical

Planning-only `/part1`: PRD v9 (`CONTEXT/planning/prd-v9-mobile-feature-wave.md`) + issues
74–81 (GH #17–24) — mobile Journal/Moments/Firsts + Storybook generate/reader over Bearer
APIs, plus social-only auth. Monetization deferred again (later superseded by PRD
v12/ADR-0023).

- Binding: wire, don't rewrite — mobile is a native front-end over existing services (ADR-0018); new server code = Bearer API route handlers only.
- Binding: auth = social-only (Login with Apple + Google), no username/password.
- Binding: local issue numbers are canonical; GH mirrors are secondary; Blocked-by uses local numbers.

(condensed 2026-07-07 — full text in git history)
