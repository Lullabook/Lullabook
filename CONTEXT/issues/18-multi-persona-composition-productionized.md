# 18 — Multi-Persona composition, productionized

Status: shipped
Wired the spike's (17) chosen default into the real durable workflow: a Page with 2+ Personas composes via sequential per-face inpaint using each Persona's `loraWeightKey`, falling back to the reference-model path under the spike-defined conditions. Multi-Persona Pages honor the same Style Bible, moderate-before-store, blob-key, per-Page isolation, and idempotency rules as single-Persona Pages. This is the current production composition path.
(condensed 2026-07-07 — full spec in git history)
