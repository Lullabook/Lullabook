# 16 — Idempotency & money-safety hardening

Status: shipped
Made the workflow safe under at-least-once retry: per-Page steps memoized; all in-workflow IDs derive deterministically from `{storybookId}/{pageIndex}` + attempt counter (no `uuid()`/`Date.now()` inside the workflow); deterministic fal idempotency key when supported. Book flips `→ failed` on no-Story or below the configured ready-Page floor. System-recovery regeneration is free (never decrements budget); only a parent-initiated re-roll spends it. A CSAM-positive on a generated image escalates to the HITL/NCMEC path (05), never a soft quarantine. These invariants still bind.
(condensed 2026-07-07 — full spec in git history)
