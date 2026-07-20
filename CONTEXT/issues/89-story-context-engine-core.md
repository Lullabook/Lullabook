# 89 — Story Context Engine core (ADR-0022)

Status: shipped; reactivated for the accepted R1 flow by ticket 181 / GitHub #155

Shipped (commit `4a771c1`) as the deterministic per-Baby context selector: significant
Moments always, ordinary Moments since last Story (watermark), roster cast, age/Firsts,
past-Story summary (90), moment-photo vision-text (never raw images, ADR-0021) — bounded
to ~2000 tokens, significant wins on trim, no extra LLM call, `ContextSelector` seam left
for a future LLM-ranking selector. Watermark advances only on a generation reaching Story text.
Previously gated off by issue 148 (PRD v16 ruthless cut). PRD v21 restores the bounded
deterministic selector to R1 through ticket 181 while keeping the same Family/Baby isolation,
watermark, trimming, and no-extra-LLM invariants.

(condensed 2026-07-07 — full spec in git history)
