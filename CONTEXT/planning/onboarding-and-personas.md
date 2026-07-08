# Onboarding & Persona Creation Flow

Status: superseded in part — the original web funnel (sign up → pay → consent) is
replaced on iOS by the Email-Plus VPC flow (PRD v3/v14), decoupled from payment.

Still-binding persona-training UX decisions:
- **Never block on training.** Kick off LoRA training the instant photos pass
  moderation; move the parent into building their Brief immediately (productive wait);
  auto-start generation when training completes, with an email/push nudge.
- Require **~10-15 photos**; automated pre-flight checks (face detected, single
  subject, resolution, blur, same-person consistency) run **before** spending GPU,
  after the safety/CSAM checks.
- **Likeness confirmation**: show sample generations before any book spend; accept or re-train.
- Training failure → auto-retry once, then **refund**, notify, guide re-upload — never
  silently bill for a dead Persona. No human views photos except in a flagged-safety escalation.

(condensed 2026-07-07 — full text in git history)
