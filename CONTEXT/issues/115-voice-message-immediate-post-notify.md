# 115 — Voice message: immediate post + notify parents

Triage: ready-for-agent

## Parent
PRD v13 — `CONTEXT/planning/prd-v13-working-app-family-accounts-pricing.md`. Track B. ADR-0024.

## What to build
A recorded **Voice message** from an invited Member self-consents to their own voice, so it
**posts to the Baby's World immediately** and **notifies the parents** (Resend/push) — no
approval inbox — and is eligible for the lullaby weave right away.

## Acceptance criteria
- [ ] A new Voice message is immediately available for story-weaving (no approval gate).
- [ ] Parents are notified; a notification failure does **not** block the post.

## Verification-command
```bash
npm test -- voice-message-notify && tsc --noEmit
```

## Blocked by
112
