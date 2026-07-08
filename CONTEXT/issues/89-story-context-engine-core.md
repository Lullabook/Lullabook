# 89 — Story Context Engine core (ADR-0022)

Status: superseded by 148-keep-daily-notes-defer-rest.md

Shipped (commit `4a771c1`) as the deterministic per-Baby context selector: significant
Moments always, ordinary Moments since last Story (watermark), roster cast, age/Firsts,
past-Story summary (90), moment-photo vision-text (never raw images, ADR-0021) — bounded
to ~2000 tokens, significant wins on trim, no extra LLM call, `ContextSelector` seam left
for a future LLM-ranking selector. Watermark advances only on a generation reaching Story text.
Gated off/deferred behind config for R1 by issue 148 (PRD v16 ruthless cut) — kept in
code for R2, not deleted.

(condensed 2026-07-07 — full spec in git history)
