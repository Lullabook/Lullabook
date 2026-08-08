# PRIME-STORY-PROMPT-EVAL — Prime Intellect GEPA on the Story prompt

Ticket #216 (GitHub #227, PRD v23). Off the critical path; user-owned / Guardian cadence.
This handoff records the outcome of evaluating Prime Intellect `prime gepa` prompt
optimization + `prime eval` scoring on the twelve-Page Story-text prompt.

## Owner / account

- `prime login`: already completed before this run (token permissions present, incl. evals).
- `prime whoami` → **Vraj Gupta** (vrajmgupta@gmail.com), User ID `cmshccxxy01gblpke3my08lgl`, type Personal.

## Golden set

The verifiers v1 taskset `environments/lullabook_story_v1` (`lullabook-story-v1`) is the golden
set: 12 curated fictional Briefs (`CURATED_BRIEFS`) covering all six Story Types, each scored by
9 deterministic rewards (parseable_json, page_contract, scene_contract, style_bible,
text_density, story_type_arc, safety_scan, cast_usage, lullaby_weave) mirroring
`src/adapters/anthropic.ts` `GENERATED_STORY_SCHEMA` + `validateGeneratedStoryContract`.

## Baseline (production model)

Production Story model is **claude-sonnet-4-6** → OpenRouter id `anthropic/claude-sonnet-4-6`
(config allows a model override; used exactly that id). Full golden set evaluated (12 tasks).

| metric | value |
| --- | --- |
| **Mean reward** | **8.42 / 9** |
| parseable_json | 1.00 |
| page_contract | 1.00 |
| scene_contract | 1.00 |
| style_bible | 1.00 |
| story_type_arc | 1.00 |
| cast_usage | 1.00 |
| lullaby_weave | 1.00 |
| text_density | 0.84 |
| safety_scan | 0.58 |
| Spend | **$0.4164** (OpenRouter; Prime balance is $0) |

Output: `outputs/lullabook-story-v1--anthropic--claude-sonnet-4-6--null/fb8e6c71-3d39-487e-9d15-43f20ca57aa8/`.
Weak spot is `safety_scan` (0.58) — Sonnet reality-checks `text`/pages/scenes but 2-3/12 stories still
trip the curated blacklist (e.g. "cried"/"scared"/"scream"); `text_density` (0.84) is above band
(some 12-page stories write 4+ sentences per page).

## GEPA pass — BLOCKED

`prime gepa` **exists** (`prime gepa run`), but it cannot ingest this verifiers **v1** taskset.
GEPA's environment loader is hardwired to `vf.load_environment(env_id=...)` (the **v0 classic**
`Environment` contract: `load_environment` + `system_prompt` + `get_dataset`/`get_eval_dataset` +
`metric(prompt, dataset)`). The v1 taskset only exports `LullabookStoryTaskset` — no
`load_environment`, no GEPA metric/dataset interface. No first-party v1→GEPA adapter is present in
the installed `verifiers` package. Result: **no optimization pass ran, no delta produced.**

Exact command run:

```bash
prime gepa run lullabook-story-v1 --env-dir-path environments \
  -m anthropic/claude-sonnet-4-6 -B 4 -n 6 -N 6 \
  --api-key-var OPENROUTER_API_KEY --api-base-url https://openrouter.ai/api/v1 \
  --plain --run-dir /tmp/opencode/gepa-try1
```

Output tail (truncated):

```
Using local environment 'lullabook-story-v1'
Resolved source: lullabook-story-v1 (local only)
WARNING - No local endpoint registry found at ./configs/endpoints.toml ... (Endpoint registry file not found)
Optimization Summary
┏━ env_id ━━━━━━━━┳ status ┳ budget ┳ iterations ┳ avg_score ┳ perfect ┓
│ lullabook-story-v1 │ done │ 0/4  │  0  │ — │ — │
┗━━━━━━━━━━━━━━━━┻━━━━━━━┻━━━━━━━┻━━━━━━━━━━━━┻━━━━━━━━━━━┻━━━━━━━━━┛
Traceback (most recent call last):
  File ".../verifiers/utils/env_utils.py", line 23, in load_environment
    raise AttributeError(
AttributeError: Module 'lullabook_story_v1' does not expose load_environment.
The above exception was the direct cause of the following exception:
  ...
RuntimeError: Failed to load environment 'lullabook-story-v1':
  Module 'lullabook_story_v1' does not expose load_environment.
```

`prime gepa run --help` confirms the loader path (no v1/taskset input mode). GEPA consumed **0**
metric calls / $0 spend (failed at env load before any model call).

## Recommendation: DROP (defer; revisit only if a v1→GEPA adapter exists)

- **Adopt**: No — no optimized prompt was produced; nothing to adopt.
- **Iterate**: No — the gap is structural: `prime gepa` needs a v0 `load_environment` GEPA
  environment, but the maintained env is v1. Building a throwaway v0 wrapper would reimplement
  scoring + prompt templating off the shipping contract, risking a non-genuine delta
  (production Story routing untouched, per ticket invariant).
- **Drop**: Yes — defer until Prime ships a first-party verifiers v1→GEPA adapter (or a GEPA path
  that accepts a Taskset). Even when unblocked, headroom is thin: the production model already
  scores 8.42/9 (and only the safety_scan/text_density checks drop below ceiling), so the 
  expected GEPA delta is small. Highest-value follow-up would be a **safety_scan/text_density**
  prompt hardening eval, not GEPA.
- **Spend observed:** baseline $0.4164 (OpenRouter); smoke $0.0357; GEPA $0 / Prime $0.

## Production routing unchanged

`src/adapters/anthropic.ts` was read (required) but **not modified**. No `src/**`, `mobile/**`,
`tests/**`, or `CONTEXT/state.md` changes. Config added: `configs/eval/lullabook-story-sonnet.toml`
(additive, orchestrator-owned dir).

## Files written

- `CONTEXT/handoffs/PRIME-STORY-PROMPT-EVAL.md` (this file, new)
- `configs/eval/lullabook-story-sonnet.toml` (new baseline config, additive)

## Verification-command

```bash
prime whoami --plain && test -f CONTEXT/handoffs/PRIME-STORY-PROMPT-EVAL.md
```

`prime whoami --plain` returns the account (above); the handoff file exists → command passes.

## Commands used (tails)

```bash
prime whoami --plain                      # account identified (Vraj Gupta)
uv run eval @ configs/eval/lullabook-story-sonnet.toml --plain
  # -> 12/12 reward 8.42 (12 run) · $0.4164
uv run eval @ configs/eval/lullabook-story.toml -m anthropic/claude-sonnet-4-6 -n 1 -r 1 --plain
  # -> 1/1 reward 9.00 · $0.0357 (smoke)
prime gepa run lullabook-story-v1 ...     # BLOCKED, see traceback above
```
