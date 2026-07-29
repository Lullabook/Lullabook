# ROUTER — read this first

Map of Lullabook's knowledge. Pointers only, no knowledge. Keep under 500 tokens.
If you want to *explain* something here, it belongs in a node instead.

Lullabook: illustrated AI storybooks starring a family's own baby, via
per-persona LoRAs. Next.js + Supabase (per-Family RLS) + R2 + Inngest.

## How to find an answer

1. Read the right index below. Open nothing yet.
2. Score candidates from the index line alone. Pick the single best.
3. Open it. Read only the section that answers.
4. Follow one link if that section points elsewhere. Stop.

## The indexes

| Looking for | Read |
|---|---|
| What a word means (Brief, Persona, Guardian, Page…) | `CONTEXT.md` |
| Why something is built this way | `index.md` → Decisions (ADR) |
| What we're building / scope / pricing / stack | `index.md` → Planning |
| A unit of work, shipped or open | `index-issues.md` |
| What happened in a past session | `index-handoffs.md` |
| What happened in the last session | `state.md` |

## Rules that beat everything else

- **Vocabulary is binding.** `CONTEXT.md` wins over any guess. Brief ≠ Prompt,
  Guardian ≠ Member, Adult Persona ≠ "Parent Persona", hard-delete ≠ archive.
- **ADRs are binding.** Don't silently contradict one. Some are superseded —
  the index line says so; the newer ADR wins.
- **Issues are dependency-ordered.** Follow `Blocked by`, don't skip ahead.
- Handoffs are *history*, not truth. Never treat one as current state.

Code lives in `src/`; repo rules in `AGENTS.md`.

## Keeping this honest

Indexes are generated. After adding or renaming anything in `CONTEXT/`, run
`npm run graph:index` (`-- --check` fails if they drifted).
