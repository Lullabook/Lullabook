# Lullabook — Session Handoff (2026-06-11)

For a fresh agent (target: **Cursor**, TDD). Pointer map — read referenced artifacts, don't re-derive from this doc.

## Session focus

Setup Matt Pocock agent skills, then TDD implementation of **PRD v2 issues 15–22** (all AFK code slices). Work split across two project subagents (`generation-pipeline`, `character-tier`).

## Current state

- **87 tests green** (`npm test`) across 21 test files.
- Still **in-memory `DataStore` + faked providers** — no real Supabase/RLS, R2, Inngest, or fal.ai yet.
- Branch: `handoff/generation-pipeline-prd-v2`.

## What was implemented (details in issues + code — not duplicated here)

| Issue | Status | Test file |
|-------|--------|-----------|
| 15 — Durable generation spine | ✅ | `tests/15-durable-generation-spine.test.ts` |
| 16 — Idempotency & money-safety | ✅ | `tests/16-idempotency-money-safety.test.ts` |
| 19 — Character + Trait Questionnaire | ✅ | `tests/19-character-trait-questionnaire.test.ts` |
| 20 — Free text-only Story | ✅ | `tests/20-free-text-only-story.test.ts` |
| 21 — Character → Persona upgrade | ✅ | `tests/21-character-to-persona-upgrade.test.ts` |
| 22 — Personalized Classics | ✅ | `tests/22-personalized-classics.test.ts` |
| 17 — Multi-Persona composition spike | ⏸ HITL | Human quality review + ADR-0005 decision |
| 18 — Multi-Persona productionized | 🔒 | Blocked by 17 |

Slices **01–14** remain green; **06–13** updated for async workflow (`workflow.drain()`), subscription gate, `storyType` on Briefs.

## Key new surfaces (read the files)

- `src/services/storybook.ts` — durable workflow, `generateFromClassic`, idempotency, `recoverPage`
- `src/services/character.ts` — `CharacterService`, `promoteToPersona`
- `src/services/text-story.ts` — `TextStoryService` (no subscription, no fal/blobs)
- `src/adapters/types.ts` — `WorkflowAdapter.enqueue`, `ClassicCatalog`, `adaptStory`, fal idempotency keys
- `.cursor/agents/generation-pipeline.md`, `.cursor/agents/character-tier.md`
- `docs/agents/` — issue tracker, triage labels, domain docs (linked from `AGENTS.md`)

## Where to start next

1. **Issue 17 (HITL)** — multi-Persona composition quality spike per [`issues/17-multi-persona-composition-spike.md`](../issues/17-multi-persona-composition-spike.md). Needs human likeness/coherence review; update ADR-0005 before 18.
2. **Issue 18** — wire chosen composition path into `StorybookService` workflow (delegate to `generation-pipeline` subagent).
3. **Issue 22 legal** — catalog tales must be legally confirmed public-domain before ship (ADR-0017); code uses `FakeClassicCatalog` placeholders.
4. **Kaizen** — run `bash tools/kaizen-coach/coach.sh` on this batch if doing a production gate.

## Human decisions needed

| Decision | Owner |
|----------|-------|
| Multi-Persona go/no-go (inpaint vs reference-model fallback) | Human — issue 17 |
| Public-domain catalog sourcing + legal sign-off | Human — issue 22 ship blocker |

## Suggested skills

| Skill | When |
|-------|------|
| `/tdd` | Any new issue implementation (vertical slices only) |
| `generation-pipeline` subagent (`.cursor/agents/generation-pipeline.md`) | Issues 18, infra wiring for real workflow |
| `character-tier` subagent (`.cursor/agents/character-tier.md`) | Character-tier follow-ups |
| `/diagnose` | If tests regress or workflow replay behaves unexpectedly |
| `/grill-with-docs` | Before changing ADR-0005 for multi-Persona |
| Kaizen coach (`tools/kaizen-coach/coach.sh`) | After meaningful changes, per `AGENTS.md` |
| `/babysit` | If opening a PR from this branch |
| `/push-handoff` | Already run this session |

## References

- Glossary: [`CONTEXT/CONTEXT.md`](../CONTEXT/CONTEXT.md)
- PRD v2: [`CONTEXT/planning/prd-v2-generation-pipeline.md`](../planning/prd-v2-generation-pipeline.md)
- Issues: [`CONTEXT/issues/`](../issues/)
- ADRs: [`CONTEXT/docs/adr/`](../docs/adr/) — especially 0004, 0005, 0011, 0016, 0017
- Prior handoff: [`SESSION-HANDOFF-2026-06-10.md`](SESSION-HANDOFF-2026-06-10.md)
