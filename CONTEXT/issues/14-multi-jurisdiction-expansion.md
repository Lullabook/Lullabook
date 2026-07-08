# 14 — Multi-jurisdiction expansion (config + residency)

Status: superseded by 147-us-only-jurisdiction-r1.md
Generalized `ConsentEngine` to per-jurisdiction config (India under-18/VPC/no-targeted-ads, Korea under-14+data-localization, Singapore PDPA, Japan APPI) with region-pinned data residency and per-country feature flags. Scoped back to US-only for R1 (147): engine stays config-driven but non-US markets are flagged off — enabling one later is a config/data change only, never a rebuild.
(condensed 2026-07-07 — full spec in git history)
