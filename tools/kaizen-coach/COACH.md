# Kaizen Domain Coach — Lullabook

A continuous-improvement review playbook. The coach reads the project's domain
docs, reviews the code against them, reports **misses** (drift from the
documented decisions), and — when asked — fixes them. "One habit: small,
continuous corrections that keep code aligned with CONTEXT + ADRs."

> Run `tools/kaizen-coach/coach.sh` to generate `KAIZEN-REVIEW-BRIEF.md`, then
> tell your agent (Antigravity / Claude / Cursor): **"Act as the Kaizen Domain
> Coach. Follow tools/kaizen-coach/COACH.md against KAIZEN-REVIEW-BRIEF.md."**

## Inputs (source of truth)

- `CONTEXT/CONTEXT.md` — the glossary (canonical vocabulary).
- `CONTEXT/docs/adr/*.md` — the load-bearing decisions (0001–0015).
- `CONTEXT/planning/*.md` — stack, PRD, onboarding, story format, monetization.
- `CONTEXT/issues/*.md` — the tracer-bullet slices.
- The code (everything else tracked in git).

## Review rubric (score each 0–10, list misses)

1. **Vocabulary alignment.** Code identifiers + UI copy use glossary terms.
   Flag drift: "idea"→**Brief**, "owner/admin"→**Guardian**, "Parent
   Persona"→**Adult Persona**, "user"→**Member**, "soft delete/archive"→**Hard-delete**,
   "prompt" used for the parent input (it's the **Brief**; *Prompt* is the
   engineered model input).
2. **ADR compliance.** For each ADR, confirm the code honors it. High-signal checks:
   - 0006/0011: **RLS** enforces per-Family isolation (not just app-layer checks).
   - 0008/0014: Baby Persona gated by Guardian + payment-VPC + consent receipt; Adult Persona gated by liveness match.
   - 0015: child-age threshold + consent + residency are **config**, never a hardcoded `13`/`18`.
   - 0007: `hardDelete` propagates across DB **and** blob store (and CDN/backups).
   - 0004: per-Page candidates + re-roll budget + `generating→draft→finalized`.
   - 0012: per-Page image prompt = Style Bible + Scene + LoRA.
   - 0010: input (photo/Brief/style) + output (image) moderation both present.
   - 0011: Anthropic/fal.ai/moderation/liveness behind **adapter interfaces**.
3. **Seam & test discipline.** Tests assert external behavior at the
   service/use-case seam with providers faked; RLS-isolation + hard-delete
   propagation have integration tests. Flag tests of Inngest/Stripe internals or
   React render details.
4. **Safety gates wired.** No minor's photo reaches storage/training before the
   moderation + consent gates. Output images moderated before display.
5. **Secrets hygiene.** No API keys / `.env` committed; `.gitignore` covers them.
6. **Slice fidelity.** Code matches the tracer-bullet slice it claims (`CONTEXT/issues/`):
   thin vertical path through all layers, demoable.
7. **Doc freshness.** New domain concepts added to `CONTEXT.md`; new
   hard-to-reverse decisions captured as ADRs; stale docs flagged.

## Output format

```
## Kaizen Coach Report — <date>
Overall: <avg>/10

### Scores
1. Vocabulary alignment — X/10
... (each dimension)

### Misses (prioritized)
- [P1] <file/area>: <what drifted from which ADR/term> → <fix>
- [P2] ...

### Suggested fixes
<concrete, ADR-cited changes — apply only the ones the user accepts>
```

## Rules

- **Cite the ADR/term** for every miss — no vibes-based nits.
- Prefer the **highest-altitude** fix; don't churn cosmetics.
- Never weaken a safety/consent/deletion gate to make a test pass.
- If a "miss" is actually a deliberate undocumented decision, the fix is to
  **write the ADR/glossary entry**, not to change the code.
