# Session Handoff — 2026-06-23: /planner → R1 release (PRD v14) + UI native polish (PRD v15)

Status: historical

Planning-only session. Produced `planning/r1-release-scope-and-invariants.md`, PRD v14
(R1 release, issues 122–135), PRD v15 (UI polish, issues 136–144), and the living
`CONTEXT/ui-snapshots/` folder. Audit found the features WERE built; fal illustration
failure (48/48) was the real "nothing works". Both PRDs since implemented.

- Binding R1 decisions: iOS-only · RevenueCat IAP · Email-Plus VPC consent · one plan +
  7-day trial · one Baby Persona / solo Guardian · Bedtime only · PDF Export, no Share
  links · free re-rolls, no credits.
- Latency/failure/security invariants live in `planning/r1-release-scope-and-invariants.md`
  (moderation fails CLOSED; likeness egress only via user PDF export; dev overrides inert in prod).
- Gotchas that still bind: run Expo on the DEFAULT host (never `--host localhost`, IPv6-only);
  expo-av is gone from Expo Go SDK 56 (lazy `getAudio()` guard); macOS `* 2.*` dupes break expo-router.

(condensed 2026-07-07 — full text in git history)
