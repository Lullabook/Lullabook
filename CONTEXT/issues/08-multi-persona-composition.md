# 08 — Multi-Persona composition (sequential inpaint + fallback)

Status: superseded by 18-multi-persona-composition-productionized.md
First cut at multi-Persona Pages: sequential per-face inpainting (each face gets its own Persona LoRA), falling back to a reference-image model if a build-time quality gate failed its bar (~8/10 two-person scenes). Reworked via the dedicated spike (17) and productionized into the real durable workflow (18); the LoRA-inpaint-default + reference-model-fallback contract is what persists (ADR-0005).
(condensed 2026-07-07 — full spec in git history)
