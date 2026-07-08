# PRD v17 — Test framework the agent can run, honest seed, and automatic error capture

Status: shipped and binding. Full decisions/invariants live in
[`r1-simplify-test-logging-invariants.md`](r1-simplify-test-logging-invariants.md)
(kept intact).

Key still-binding facts: **Sentry** is the chosen logging vendor (free Developer plan,
EU/Frankfurt region, mandatory PII scrubbing) — wired into both `@sentry/nextjs` and
`@sentry/react-native`. Logging **fails open** (opposite of moderation). The logger
must never capture child photos, biometric/LoRA data, PII, consent tokens, or secrets;
Session Replay is off on any screen showing a photo or a child's name. `npm run verify`
is the single agent-runnable gate, <5 min, exits non-zero on any real failure.

(condensed 2026-07-07 — full text in git history)
