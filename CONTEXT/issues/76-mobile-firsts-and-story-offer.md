# 76 — Mobile Firsts view + inline "Make this a Story" offer

Status: shipped

Firsts view filters the issue-75 timeline to `momentType === "first"`/milestone; each
first shows a "Make this a Story" action routing into the Storybook create flow (78)
with the Moment pre-seeding the Brief/theme. Suggestion contract holds: parent must
still confirm Story Type before any generation spend — viewing/opening the offer never
triggers generation. Closed as code-complete (GH #19); HITL pass owed to issue 85 (never
executed).

(condensed 2026-07-07 — full spec in git history)
