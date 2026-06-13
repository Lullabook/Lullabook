# 24 — Free Character tier: Trait Questionnaire + text Story + native reader

- Type: AFK · Triage: ready-for-agent
- Parent: [PRD v3 — Native iOS](../planning/prd-v3-native-ios.md)
- Implementer: Cursor Composer 2.5, TDD

## What to build

The free acquisition hook, end-to-end on device. A parent builds a **Character**
by answering the **Trait Questionnaire** (name, nickname, relationships, favorite
animals/toys, songs, topics) — photo-free, no LoRA, no biometric — then generates
a **free, text-only Story** with a chosen **Story Type** (Bedtime or Learning)
and reads it in a lovely native reading view. Real children get the **light
attestation** consent checkpoint (per Jurisdiction config); fully-fictional
Characters skip it. **Not gated on a Subscription** — text is always free. Calls
the existing `CharacterService` / `TextStoryService` through Bearer-authed routes
(API surface grown for this slice).

## Acceptance criteria

- [ ] A parent can create a **fictional** Character with no consent step, and a
      **real-child** Character with a recorded notice + single guardian **light
      attestation** where the (faked) Jurisdiction config requires it.
- [ ] A parent can generate a **text-only Story** from a Character, choosing
      **Story Type** (Bedtime / Learning), with **no fal.ai / no Style Bible / no
      blob / no subscription** — asserted at the service seam.
- [ ] A native **reading view** renders the text Story warmly (Dynamic Type,
      VoiceOver labels, sufficient contrast).
- [ ] **Bug fix (text moderation fail-closed):** a non-numeric moderation class
      score is treated as a **failure**, not a pass; covered by a test.
- [ ] **Bug fix (`sync()` batching):** the data store does not serialize ~34
      round-trips per commit where the text path exercises it; behavior unchanged,
      round-trips reduced (assert via a counting fake or equivalent).
- [ ] Existing web tests stay green; new behavior tested at the
      `CharacterService` / `TextStoryService` seam with Anthropic faked.

## Blocked by

- [23 — Native auth end-to-end over a Bearer-authed backend](./23-native-auth-bearer-backend.md)
