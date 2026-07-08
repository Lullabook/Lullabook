# PRD v16 — R1 Ruthless Cut: solo, no audio, no multi-family, US-only

Status: shipped and binding, with one amendment. Full decisions/invariants live in
[`r1-simplify-test-logging-invariants.md`](r1-simplify-test-logging-invariants.md)
(kept intact). **Amendment (PRD v19 / ADR-0026):** Journal + Learning story type were
restored (un-cut) after this PRD shipped — everything else here (audio, multi-family,
Asia) **stays cut**.

Core rule that still governs every cut feature: a cut must be **inert, not broken** —
gated server-side with no reachable UI, never a dead button/500/hanging spinner. A
disabled endpoint returns a clean 404/403.

(condensed 2026-07-07 — full text in git history)
