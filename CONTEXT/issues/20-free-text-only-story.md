# 20 — Free text-only Story generation

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v2](../planning/prd-v2-generation-pipeline.md)
- Refs: ADR-0016, ADR-0009
- Glossary: Character, Story Type, Story, Brief, Prompt

## What to build

Let a parent generate a **free, text-only Story** starring their **Characters**.
A Brief selects starring Characters, a Story Type (`bedtime | learning`), a
theme, and an optional note; a single `AnthropicAdapter` text pass derived from
the Characters' traits produces the Story text. This path has **no fal.ai, no
Style Bible, no BlobStore, and no durable fan-out** — text is one cheap call — and
is **not** gated on an active subscription. It is gated on at least one valid
Character. Any free-text note passes the same moderation rails as a Brief.

## Acceptance criteria

- [ ] A parent with no subscription can generate a text-only Story from one or more Characters.
- [ ] The Story Type (`bedtime | learning`) shapes the generated text.
- [ ] No fal.ai, BlobStore, or Style-Bible work occurs on the text-only path.
- [ ] A free-text note is moderated like a Brief before generation.
- [ ] `TextStoryService.generate` tested at the service seam with Anthropic faked; assert no fal/blob calls and no subscription requirement.

## Blocked by

- 19 — Character creation via Trait Questionnaire + light consent
