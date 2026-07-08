# 125 — Real persona likeness in dev + real likeness-confirmation gate
Status: shipped
Replaced the faked FakeWorkflow-synthesized persona `ready` state with a real path: dev personas reach ready with a usable LoRA (or an explicit DEV_FAL_FALLBACK placeholder). Made likeness confirmation (review sample generations → accept/retrain) real and gating — a book cannot generate from an unconfirmed persona.
Invariant: LoRA training failure → persona failed, surfaced, no book charge; SLA < 15 min to ready/failed.
(condensed 2026-07-07 — full spec in git history)
