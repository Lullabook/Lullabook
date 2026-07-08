# 124 — Honest DEV_DEMO_SEED (real text + images, not empty display rows)
Status: shipped
Replaced the empty-display seed (src/dev/seed-maya-world.ts, page-less books) with a real double-gated DEV_DEMO_SEED that creates a baby + small family roster + a Bedtime Storybook with real generated text and images (via the real pipeline or DEV_FAL_FALLBACK). Wired DEV_DEMO_SEED=true into dev:paid so /api/dev/seed and the in-app seed button stop 403-ing. Seeded book meets the same terminal-state + <500KB payload invariants as a user-generated one.
(condensed 2026-07-07 — full spec in git history)
