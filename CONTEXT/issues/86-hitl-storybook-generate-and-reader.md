# 86 — HITL: Storybook generate & reader (real pipeline)

Triage: ready-for-agent (HITL)

## Parent
PRD v10 — `CONTEXT/planning/prd-v10-hitl-smoke-verification.md`

## What to build
The headline slice: actually run the **real Anthropic + fal.ai LoRA pipeline** end to end
on the Simulator and read the result. Verifies Storybook generation (issue 78), the paged
reader (issue 79), and folds in the lullaby real-path runbook (issue 73).

- **Generate (78):** assemble a Brief (starring cast + Story Type + theme), submit;
  confirm `generating → draft` **within the 5 min budget** (latency invariant). Story Type
  is confirmed in-flow before any spend.
- **Reader (79):** open the draft; each Page pairs text + illustration; **each page image
  loads within 30s** (latency invariant). Images come via the authenticated image path —
  confirm **no raw uploaded photo** is exposed, only generated illustrations (ADR-0020).
- **Re-roll / candidates (79):** where the API exposes it, re-roll or pick a candidate and
  confirm the Page updates in place (within the re-roll budget).
- **Failure handling:** confirm a failed generation is **re-rollable** (not a dead end)
  and a failed Page renders as a **recoverable hole**, not a crash (failure-mode invariants).
- **Lullaby real-path (73):** with a Voice clip chosen as the lullaby, confirm it lands on
  the final page, the narrative sets up the recorded phrase, and the Reader plays the
  correct clip per page.

## Acceptance criteria
- [ ] A Storybook reaches `draft` within 5 min; reader pages load text + illustration within 30s each.
- [ ] No raw uploaded photo is ever shown in the reader — generated illustrations only.
- [ ] Re-roll / candidate select updates a Page in place where supported.
- [ ] A failed generation is recoverable; a failed Page is a hole, not a crash.
- [ ] Lullaby clip lands on the final page, narrative sets up the phrase, correct clip plays per page.
- [ ] Each step recorded PASS/FAIL; any FAIL filed as a `bug` issue with repro.

## Blocked by
82, 83, 84
