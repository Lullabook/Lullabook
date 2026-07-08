# 26 — Email-Plus VPC + Character→Baby Persona promotion + first illustrated Storybook

Status: shipped

Foundational: Email-Plus VPC consent state machine (`requested → link_sent → confirmed`, version-stamped Consent receipt, delayed revoke-link email), gating Baby Persona creation on active Subscription + confirmed `email_plus` where Jurisdiction requires it. Photo upload rides the moderation-first pipeline (moderate bytes before persist; CSAM escalates to HITL/NCMEC). This consent mechanism is still core to R1 (see 32/33/127/172/173). Naming later shifted: Persona → "Family member" (35); Character→Baby-Persona promote path retired (36).

(condensed 2026-07-07 — full spec in git history)
