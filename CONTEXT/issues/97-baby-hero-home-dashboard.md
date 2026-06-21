# 97 — Baby-hero Home dashboard + context-engine nudge

Triage: ready-for-agent

## Parent
PRD v12 — `CONTEXT/planning/prd-v12-release-grade-monetization-context-ux.md`. Track C.

## What to build
The health-app-style Home: a glanceable dashboard, not a settings list. The emotional
hero + one primary CTA + summary cards; detail stays in the tabs (issue 96).

- **Hero:** the baby's World with a single primary CTA ("Start a story" / continue).
- **Cards:** **Continue reading** (last book), a **context-engine Story nudge** (from
  issue 89 — e.g. "Maya's first steps last week — make a story?"), **this-week / streak**,
  **Family activity**.
- Nudge content comes from the Story Context Engine; if the engine has nothing notable,
  the card shows a friendly default (no empty/broken state).

## Acceptance criteria
- [ ] Home renders the hero + primary CTA + the four summary cards; full lists live in tabs.
- [ ] The nudge is wired to the context engine (issue 89) and degrades to a friendly
      default when there's nothing notable.
- [ ] **Latency invariant:** Home (incl. the nudge) loads **p95 <1s** on local `dev:paid`.
- [ ] **Security invariant:** the dashboard renders **no raw uploaded photo** — only
      generated avatars/illustrations (ADR-0020/0021).
- [ ] Tests cover the card set, the nudge wiring + default, and the no-raw-photo guard.

## Verification-command
```bash
npm test -- home-dashboard && tsc --noEmit
```

## Blocked by
89, 96
