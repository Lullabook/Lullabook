# PRD v10 — HITL full-app smoke verification

Status: superseded/executed. This wave's owed-verification issues (82-88) were run;
later automated `verify` gate (PRD v17) replaces most of this manual process.

Still-binding process rules:
- HITL testing uses a **dedicated test Family with dev/sample photos only** — never
  real children's photos or production users; wiping it doubles as the hard-delete check.
- `DEV_FORCE_SUBSCRIPTION` and similar dev overrides are dev-only and must never ship enabled.
- A failed HITL step files a new defect issue with repro steps; closed feature issues stay closed.
- Real secrets/keys are never committed; runbooks reference env-var names only.

(condensed 2026-07-07 — full text in git history)
