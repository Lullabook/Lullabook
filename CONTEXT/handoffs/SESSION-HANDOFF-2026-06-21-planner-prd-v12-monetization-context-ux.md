# Session Handoff — 2026-06-21: /planner PRD v12 (monetization + context engine + UX)

Status: historical

Planning-only: PRD v12, ADR-0022 (Story Context Engine, deterministic selector,
≤~2000 tokens, no extra LLM call) + ADR-0023 (3-tier monetization), issues 89–99.
Three-tier pricing ($8/$15/$25) later collapsed by R1 to one plan (issue 146 / PRD v20).

- Still binding: no free tier — trial + card-on-file = VPC; baby-free demo Story
  delivers the pre-card aha; failure refunds the credit, never charge a failed gen.
- Still binding: no child likeness without VPC (cornerstone); tier/cap/credit enforced
  server-side 403 + idempotent; context engine per-Family RLS, write-only vision→text.
- Custom art style = trained Style LoRA (durable pipeline like persona LoRA).

(condensed 2026-07-07 — full text in git history)
