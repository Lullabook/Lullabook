# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT/CONTEXT.md`** — canonical glossary; use this vocabulary in code, tests, and UI.
- **`CONTEXT/docs/adr/`** — architectural decisions (ADR-0001 through ADR-0017+). Read ADRs that touch the area you're about to work in.
- **`CONTEXT/planning/`** — PRDs (`prd-v1.md`, `prd-v2-generation-pipeline.md`) and stack (`stack.md`).
- **`CONTEXT/issues/`** — dependency-ordered tracer-bullet work items; follow `Blocked by` links.

There is no `CONTEXT-MAP.md`; this is a **single-context** repo with domain docs under `CONTEXT/`.

## File structure

```
/
├── CONTEXT/
│   ├── CONTEXT.md
│   ├── docs/adr/
│   ├── planning/
│   ├── issues/
│   └── handoffs/
├── docs/agents/          ← agent skill configuration (this folder)
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT/CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

Notable terms: **Brief** (parent input) vs **Prompt** (engineered model input); **Guardian** vs **Member**; **Adult Persona** (not "Parent Persona"); **Hard-delete** (not soft-delete/archive); **Character** vs **Persona**.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (data lifecycle) — but worth reopening because…_
