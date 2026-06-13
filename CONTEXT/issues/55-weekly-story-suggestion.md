# 55 — Weekly Story suggestion

Triage: ready-for-agent

## What to build
The one-tap "turn the week into a story" loop — a suggestion that pre-fills a Brief
from the week's Moments and **always confirms before spending**.

- A **Weekly Story suggestion** card on the World home that appears once a week for
  a Baby when a threshold is met (e.g. ≥ N Moments that week and/or ≥1 Significant
  Moment — pick a sensible default, make it a constant).
- Tapping it assembles a **suggested Brief** from that week's Moments (reuse the
  week-grouping from issue 52): the **Baby stars**; **cast** = the Family/Characters
  linked in the week's Moments (issue 51); **theme** seeded from the Significant
  Moment(s). It then deep-links into the existing Create flow with those fields
  pre-filled.
- The parent picks the **Story Type** and edits anything, then **confirms** —
  generation only runs on explicit confirm. **No silent background generation.**
- The auto-context layer (issue 54) still applies to the resulting Story; this card
  only changes what the *Brief* starts pre-filled with.

## Acceptance criteria
- When the weekly threshold is met, the suggestion card appears once for that week
  and Baby; below threshold it does not.
- Tapping it lands in Create with baby + cast + theme pre-filled from the week's
  Moments, parent-editable.
- No generation/spend occurs until the parent explicitly confirms in Create.
- Tests cover threshold gating, the Brief assembly (cast from linked people, theme
  from significant Moments), and that no generation fires before confirm.

## Blocked by
51 (linked people), 52 (week grouping), 54 (auto-context layer)
