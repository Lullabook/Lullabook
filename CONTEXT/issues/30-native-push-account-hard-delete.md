# 30 — Push + account + in-app hard-delete

Status: shipped

Native push (`push_subscriptions` store, Expo push at "Persona ready"/"Storybook ready"), account screen (Members, Jurisdiction notice, subscription status), and in-app Delete Account (hard-delete, no web redirect — App Store 5.1.1(v)). Binding invariant: hard-delete must clear `textStories`, `pendingBriefs`, `moderationAudit`, and `push_subscriptions`, and `sync()` must never re-upsert deleted rows — this propagation rule is extended by every later hard-delete issue (69, 134).

(condensed 2026-07-07 — full spec in git history)
