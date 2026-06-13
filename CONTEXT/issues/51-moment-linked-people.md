# 51 — Linked people on a Moment

Triage: ready-for-agent

## What to build
Let a Moment record **who was there** — the Family-roster members and Characters
present — so later story personalization can cast the right people.

- Migration: additive join table `moment_people` linking a Moment to existing
  Family-roster members and/or Characters (polymorphic ref or two nullable FKs).
  Reversible.
- Capture form: a "Who was there?" picker listing the Baby's Family roster +
  Characters. Optional, multi-select. Logging a Moment **never creates** a person —
  it only references existing ones.
- Service: `createMoment` / `updateMoment` persist the linked people; `listMoments`
  returns them. Linked people are removed when the Moment is deleted.
- Journal timeline: show small avatars/initials of linked people on each Moment.

## Acceptance criteria
- A parent can attach zero or more existing Family members / Characters to a Moment
  and they render on the timeline.
- Deleting a Family member / Character (or hard-deleting the Baby) cleans up the
  join rows without orphaning Moments.
- Migration additive + reversible; existing tests stay green.
- Tests cover linking, listing with people, and cleanup on person/Moment deletion.

## Blocked by
50 (Moment capture + Journal timeline)
