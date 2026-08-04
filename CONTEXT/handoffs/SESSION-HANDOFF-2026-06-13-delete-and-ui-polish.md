# Session Handoff — 2026-06-13: delete Character + UI/perf polish

Status: historical

`/coder` follow-up on issues 34–44 (156 tests, build green): `CharacterService.delete()`
(issue 45) with confirm UI, restyled `/characters/new`, `/personas/new`, and the
promote page to v2 (scoped `.v2-form` CSS), halved per-navigation server work by
wrapping `getAuthedContext` in React `cache()`, and replaced the dead voice-record
button with an honest "coming soon" pill.

- Binding: Character delete is a hard-delete (ADR-0007) purging the row and any light consent receipts, family-scoped through the existing `sync()` delete path.
- Binding: `getAuthedContext` is memoized per render via React `cache()` — layout and page share one auth round-trip + one hydration; server actions get their own context.
- Binding: no dead buttons — unbuilt features show honest "coming soon" affordances, never fake-actionable controls.

(condensed 2026-07-07 — full text in git history)
