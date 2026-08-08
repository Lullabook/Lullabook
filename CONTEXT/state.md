## Now

- 2026-08-08 **coder max-parallel campaign (PRD v23).** Orchestrator Kimi K3 +
  deepseek-v4-flash-0731 opencode workers in per-lane git worktrees + kimi-k3
  gauntlet critics. Handoff: `SESSION-HANDOFF-2026-08-08-coder-prd-v23-max-parallel.md`.
  **Debugger Ready:** #213 (repro doc — dev DB missing migration 023 is THE demo
  blocker), #214 (callback preflight, fail-closed live path), #218 (consent roster),
  #221 (story context), #222 (illustration), #227 (GEPA: v1 taskset can't load, DROP
  rec). **Merged, gate green, critic pending:** #216, #217, #220-core, #223-r2, #224-r2.
  **Open:** #219 (live trainings — `LIVE_PROVIDER_RUN_APPROVED` + real photos are
  Guardian gates), #220-integration (native/API wiring), #226 (purchase signal),
  #193 (doc-only, reviewer). **Guardian action needed:** apply migration
  `023_moderation_audit_family_ownership.sql` to the hosted dev Supabase
  (`pavdmqbwphqevaansxcs`) — all authenticated writes 500 until then.
  Root+mobile `.env.example` are now tracked (tests depend on them).


- 2026-08-07 **Prime Lab setup for Lullabook complete.** `prime lab doctor` all
  PASS (workspace metadata, configs, skills, hygiene). New verifiers v1
  taskset `environments/lullabook_story_v1` — the story-writer LLM env: model
  produces the one-pass structured Story JSON (text/pages/scenes/styleBible,
  mirroring `src/adapters/anthropic.ts` `GENERATED_STORY_SCHEMA` +
  `validateGeneratedStoryContract`), scored by 9 deterministic rewards
  (JSON parse, page/scene/styleBible contract, 1-3 sentences/page density,
  Story Type arc, safety scan, cast usage, exact lullaby phrase) + optional
  LLM judge (`taskset.task.enable_judge`, default off). 12 curated fictional
  Briefs, all six Story Types; fictional cast only (privacy: no real-child
  likeness, ADR-0007/0020/0021). Config `configs/eval/lullabook-story.toml`
  (null chat harness, OpenRouter). Baseline: `openai/gpt-4.1-mini` ≈ 8.7/9;
  `openai/gpt-5.4-nano` ≈ 1-2/9 (writes markdown, not the JSON contract).
  **Gotcha:** v1 tasksets run via `uv run eval @ configs/eval/lullabook-story.toml`,
  NOT `prime eval run` (that's the v0 bridge and fails on v1 packages). Prime
  Inference balance is $0 — evals need `OPENROUTER_API_KEY` (or funds on the
  Prime account). Prime still cannot train the FLUX LoRA; `prime rl` is for
  the story-text LLM only. Env not yet pushed to Hub (visibility decision pending).
- 2026-08-06 **planner published PRD v23 — full-likeness family demo.** Spec
  `CONTEXT/planning/prd-v23-full-likeness-demo.md`; handoff
  `SESSION-HANDOFF-2026-08-06-planner-prd-v23.md`. 16 tickets, local 202–217 =
  GitHub #213–#228. **Agent Ready:** #213 (reproduce live failures), #214
  (Vercel callback URL), #215 ($20 fal cap), #225 (branding audit), #228 (demo
  Pro grant). Everything else Planned behind blockers. Next agent starts at
  #213. Root cause of "the app doesn't work": the live provider path has never
  run — no LoRA ever trained, `LIVE_PROVIDER_RUN_APPROVED` never set, no
  callback ever received. **Guardian-owned blocker:** the photo folder
  `lullabook family testing` + handover doc gate ticket 206 onward.
  **fal.ai budget is $20**, fail-closed; only the Guardian raises it.
  Prime Intellect is off the critical path (`prime train` is LLM RL, it cannot
  train a FLUX LoRA).
- 2026-08-04 reviewer drained Review Ready: #202 (RevenueCat lifecycle) and #205 (hard-delete/RLS evidence) both **PASS → Done**. Queue empty. Handoff `SESSION-HANDOFF-2026-08-04-reviewer-202-205.md`. PRD v22 implementation tickets on the board are Done; live/human release evidence remains BLOCKED by design.
- #203/#205 live-evidence parts (native smoke, real provider IDs, billing
  reconciliation, real RLS/hard-delete, human sign-offs) report BLOCKED by design;
  require wayfinder #135/#150 + fresh approvals.
- #193 (parent index) is doc-only — flagged for /reviewer or a human to close.
- #206-#209 (iPhone device dev build) planned by a parallel planner on the same
  branch — user-owned, do not build without instruction.
- Gotchas unchanged: `.env.example` needed for verify; Metro binds `[::1]` on this
  machine (ipv4-metro-proxy); verify now has a 30s vitest test timeout (pg-embedded)
  and Playwright SKIPs honestly on ETIMEDOUT.
- **Expo Go is dead for SDK 56** (mobile/ is on Expo SDK 56; the App Store Expo Go
  build refuses the project and no newer Expo Go exists). The physical-device path
  is `npm run ios:device` (native dev build, free Apple ID, 7-day re-signing) — see
  `CONTEXT/local-dev/RUN-ON-IPHONE.md`. The Simulator path (`npm run ios`) is
  unaffected.
## Recently tried

- **Token benchmark, graph vs raw `CONTEXT/`** (2026-07-29, cl100k). Three
  questions, cost = tokens that must enter context to answer *correctly*.
  Raw baseline = file list (4,948 tok) + grep output + every file the grep
  surfaces that can't be ruled out without opening it.

  | question | raw | graph | save |
  |---|---|---|---|
  | current monetization model | 35,593 | 7,768 | 78% |
  | storage provider and why | 23,419 | 5,968 | 75% |
  | open issue about PDF export | 11,491 | 1,350 | 88% |
  | total | 70,503 | 15,086 | **79%** |

  Whole vault read end-to-end: 144,641 tok.

  The PDF question was **−8%** on the first run: `index-issues.md` held all 176
  issues at 11,295 tok, more than grepping the folder. Splitting live from
  settled (below) fixed it to +88% and took the total from 63% → 79%.

  Correctness, not just cost: the monetization answer needs the chain
  0009 → 0023 → 0025 → 0028. Reading the 5 plausible-looking files raw costs
  11,515 tok and returns the **wrong** answer (stops at 0025, misses that
  ADR-0028 supersedes its R1 price and Story cap). The index line carries the
  status, so the graph sees the reversal without opening anything.

## Dead ends — do not retry

- (nothing logged yet)

- **Issue index split live from settled** (2026-07-29). `build-graph-index.mjs`
  now emits `index-issues.md` (20 open, 897 tok) and `index-issues-closed.md`
  (156 settled, 10,433 tok); ROUTER points at both. 20 + 156 = 176, nothing
  lost. A node with **no** status counts as live, so an unlabelled issue can
  never silently vanish from the open list.

## Open questions

- (nothing logged yet)
