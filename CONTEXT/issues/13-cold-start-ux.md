# 13 — Cold-start UX: train-in-background + notifications

Status: shipped
LoRA training starts the instant uploaded photos pass moderation; the parent proceeds straight into building their first Brief instead of waiting. Book generation auto-starts on training-complete if a Brief was already submitted; notifies via email + web push. "Never block the parent on training" invariant persists; notification channel later folded into native push.
(condensed 2026-07-07 — full spec in git history)
