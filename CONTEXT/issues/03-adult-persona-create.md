# 03 — Adult Persona creation (self, liveness-gated)

Status: shipped
Adult (self) Persona: upload photos, pass selfie/liveness match, pass pre-flight checks (face present, single subject, resolution, blur, same-person consistency) before any training run starts, then fal.ai LoRA training; `training → ready/failed`. On ready, show likeness-confirmation samples; on failure, auto-retry once then refund + guide re-upload. This upload→preflight→train pattern is the base later reused for Baby Persona (04) and native Adult Persona (28).
(condensed 2026-07-07 — full spec in git history)
