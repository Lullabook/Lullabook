# 123 — DEV_FAL_FALLBACK placeholder images (populated demo without live keys)
Status: shipped
Added DEV_FAL_FALLBACK, double-gated (NODE_ENV !== "production" AND an explicit flag, like DEV_FORCE_SUBSCRIPTION), returning deterministic placeholder page images + a usable placeholder LoRA so the Simulator/demo reach a populated illustrated draft without live fal keys. Inert in production; no flag/secret leaks to the client bundle.
(condensed 2026-07-07 — full spec in git history)
