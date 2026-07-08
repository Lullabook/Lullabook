# Session Handoff — 2026-06-14 — Maya's World v2 design sweep + UX fixes

Status: historical

Completed the full legacy "bedtime" → Maya's World v2 design migration across web:
billing, personas, story/storybook detail, classics, goodbye/hard-delete, reader,
composer, auth, landing, and public share pages, plus all user-reported drift
(button contrast, fonts, form copy).

- Binding: design source of truth is `src/components/v2/tokens.ts` + `globals.css` v2 classes; build/lint UI with `lullabook-design` / `lullabook-design-check`.
- Binding: Character auto-descriptions are one short sentence (`max_tokens: 80`).
- Binding: Daily "Who was there?" lists roster family only — never made-up Characters.
- Binding: baby persona forms hide relationship/nickname fields.

(condensed 2026-07-07 — full text in git history)
