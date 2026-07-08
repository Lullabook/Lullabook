# 78 — Mobile Storybook generation (Brief flow → generate → poll)

Status: shipped

Native create path: Brief flow (starring cast, Story Type Bedtime/Learning, theme,
optional note; accepts pre-seeded theme from Firsts offer or Daily button) → submit
calls `createStorybook` (77) → status screen polls `getStorybook(id)` until
draft/failed. Dev-forced subscription unlocks generation in Simulator; inactive shows
existing "subscription required" state. Failed generation is re-rollable, not a dead
end. Closed as code-complete (GH #21); HITL pass owed to issue 86 (not in this batch).

(condensed 2026-07-07 — full spec in git history)
