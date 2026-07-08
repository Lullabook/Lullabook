# Session Handoff — 2026-06-14: Roster Avatars, Local-Dev Ergonomics & TestFlight (PRD v7, issues 57–63)

Status: historical

Planning-only `/part1`: wrote PRD v7, ADR-0020, the "Roster avatar" glossary term, issues
57–63, the running UI feedback log (`CONTEXT/planning/web-and-app-feedback.md`), and
created the `lullabook-design` + `lullabook-design-check` project skills.

- Binding (ADR-0020): roster avatar is display-only, generated from the person's LoRA on `ready`; raw photos never rendered anywhere (web + mobile, Baby and adults alike). ADR-0001/0002 untouched — LoRA still trains on real photos.
- Binding: photo replace → retrain → regenerate avatar.
- Binding: two-mode local dev — `dev:free` (:3000) / `dev:paid` (:3001); prod requires real R2 blob store.
- TestFlight = one HITL runbook; Apple Developer membership is the hard gate.

(condensed 2026-07-07 — full text in git history)
