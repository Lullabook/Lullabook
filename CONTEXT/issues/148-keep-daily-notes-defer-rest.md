# 148 — Keep Daily Notes; defer the rest of Journal/Moments

Triage: ready-for-agent

## Parent
PRD v16 — `CONTEXT/planning/prd-v16-r1-ruthless-cut.md`. Track S4. Amends PRD v14's defer list.

## What to build
Keep the **lightweight daily note / Moment capture** in R1 (solo Guardian, one baby): log a
dated note for the baby, see them listed. **Defer the heavy machinery** — gate off the Story
Context Engine (auto-context injection into the Prompt), Firsts view, Birthday Story, weekly
Story suggestion, and photo-to-story. Deferred pieces must be **inert** (no reachable UI, no
endpoint that 500s) — a cut, not a half-feature.

## Acceptance criteria
- [ ] A solo Guardian can create and list daily notes for their one baby (capture works
      end-to-end).
- [ ] Story Context Engine / Firsts / Birthday / weekly suggestion / photo-to-story are **gated
      off**: no reachable UI, endpoints return a clean `404`/`403`, never 500.
- [ ] Story generation does **not** depend on the deferred auto-context layer (a book generates
      with daily notes present or absent; no spinner waiting on it).
- [ ] Deferred code stays behind config for R2 (not deleted).
- [ ] A test asserts daily-note capture works and the deferred surfaces are inert.

## Verification-command
```bash
npm test -- 148-daily-notes && (cd mobile && npx tsc --noEmit)
```

## Blocked by
_none_
