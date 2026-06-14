# 62 — Mobile roster-avatar parity (ADR-0020 on native family screens)

Triage: ready-for-agent

## What to build
Port the [ADR-0020](../docs/adr/0020-roster-avatar-generated-not-raw-photo.md) rule to
the native iOS (Expo) app: roster members display the generated **Roster avatar** (or
placeholder), never the raw uploaded photo.

- Mobile family screens (`mobile/app/family/*`, member rows/cards, any member picker)
  render the Roster avatar resolved from `avatarKey` (served via the same backend
  endpoint the web uses), with the gradient-circle + initial placeholder while
  `training`/`failed` or `avatarKey` null.
- The native "add / update reference photos" flow uploads through the existing backend
  (issues 58/59) and **never displays** the stored photos back — same invariant as web.
- Reuse shared types via the `@domain/*` alias (per the native PRD v3 setup); no new
  backend logic — mobile consumes the issue-58/59 endpoints.

## Acceptance criteria
- No native screen renders a raw uploaded photo for any member; the avatar/placeholder
  shows instead.
- The avatar matches what the web shows for the same member (same `avatarKey`).
- Adding/updating photos on mobile drives the same retrain → regenerate path; the
  placeholder shows during training.
- `npx tsc --noEmit` + lint pass for `mobile/`; web tests stay green. Verify in the iOS
  Simulator (no RN render-detail unit tests, per the native test seam convention).

## Blocked by
58 (web avatar seam + `avatarKey` + endpoints)
