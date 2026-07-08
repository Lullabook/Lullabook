# 134 — Hard-delete erases all stores + consent-revoke → purge
Status: shipped
Hard-delete: guardian-triggered, erases ALL child data across every store (photos, LoRA weights, prompts, persona metadata, generated Storybooks). Wired consent-revoke (127) to route existing child data into the same purge path.
Invariant: hard-delete is always available to the guardian, never gated by subscription state; a test verifies nothing remains after delete.
(condensed 2026-07-07 — full spec in git history)
