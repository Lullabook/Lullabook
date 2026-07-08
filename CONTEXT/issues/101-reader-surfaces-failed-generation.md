# 101 — Reader surfaces failed/timed-out generation; POST error not swallowed

Status: shipped

Fixed the mobile reader (`storybooks/[id].tsx`) polling `generating` forever with no
terminal/error state, and the generate POST (`storybooks/new.tsx`) navigating to the
reader immediately while swallowing errors. Reader now shows a failed/timed-out state
(retry/back), polling stops after a max elapsed/attempts, and a failing generate POST
surfaces its error on the create screen instead of navigating into a dead reader.

(condensed 2026-07-07 — full spec in git history)
