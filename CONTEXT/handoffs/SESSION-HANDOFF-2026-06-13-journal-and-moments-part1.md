# Session handoff — 2026-06-13 — Journal & Moments `/part1` (plan only)

A **planning-only** `/part1` run: grilled the new "daily capture → personalized
stories" feature, wrote PRD v6 + ADR-0019, updated the CONTEXT glossary, and cut
issues **50–56**. **No application code** was written — the visual design is being
produced separately (Claude Design v2 → `/world`), and **part 2 implementation is
handed to Cursor's Composer**.

## The feature in one line
Parents log lightweight **Moments** about a **Baby**; a **Journal** surface holds
the timeline + a weekly spread; recent Moments **auto-personalize** every generated
Story; a weekly one-tap suggestion turns the week into a storybook.

## Locked decisions (from grilling)
- **Moment** = dated, parent-logged event about one Baby. **Light structure (v1):**
  free text + date + optional linked people (Family/Characters present) + a
  `significant ✨` flag. Mood/photo = deferred "rich structure" pass.
- **Journal** = per-Baby surface in the World: Moment timeline + weekly spread
  ("day in the life"). One per Baby.
- **Significance** = a single boolean flag (not a Milestone entity, not a 1–5 score).
- **Personalization** = **auto-context layer** (ADR-0019), *not* a Brief input.
  Contract: every Significant Moment + ordinary Moments **since the Baby's last
  Story**; per-Baby watermark advances only on a successful generation.
- **Schedule** = capture is always free-form; the nudge + weekly spread + weekly
  story suggestion are optional layers on top. All three are in the v1 build.
- **Weekly story** = **suggestion + one-tap, confirm before any spend** — never
  silent background generation. Pre-fills Brief: baby + cast (linked people) + theme
  (from significant Moments).
- **Daily nudge** = in-app World-home card everywhere; native iOS also via push
  (issue 30). Capture never forced.
- Monetization deferred (tier-agnostic), consistent with PRD v5.

## Artifacts produced
- **PRD:** `CONTEXT/planning/prd-v6-journal-and-moments.md`
- **ADR:** `CONTEXT/docs/adr/0019-moments-auto-context-personalization.md`
- **Glossary:** `CONTEXT/CONTEXT.md` — new "Journal & Moments" section (Moment,
  Significant Moment, Journal, Auto-context layer, Daily nudge, Weekly Story
  suggestion).
- **Issues 50–56** in `CONTEXT/issues/` (all `Triage: ready-for-agent`).

## Slice order (dependency-ordered) — next agent starts at issue 50
| # | Slice | Blocked by |
|---|---|---|
| 50 | Moment capture + Journal timeline (walking skeleton) | 34 |
| 51 | Linked people on a Moment | 50 |
| 52 | Journal weekly spread ("day in the life") | 50 |
| 53 | Daily nudge card (in-app) | 50 |
| 54 | Auto-context personalization layer (ADR-0019) | 50 |
| 55 | Weekly Story suggestion | 51, 52, 54 |
| 56 | Native push for the daily nudge | 53, 30 |

**Start at 50** (foundation). 51/52/53/54 all unblock off 50 and can go in
parallel; 55 needs 51+52+54; 56 needs 53.

## Open decisions to grill before/while building (carried into part 2)
- Weekly-story trigger threshold (how many Moments / require a significant one?).
- Newest-N ceiling + token budget value for the auto-context set.
- Watermark on a failed generation (lean: only text-reaching Stories consume).
- Whether aged-out ordinary Moments are gone vs offered as Brief picks (lean: gone).
- Native push scheduling / quiet-hours for the daily nudge.

## UI drop-in applied this session (from `~/Downloads/Lullabook (1)`)

The "Maya's World" v2 redesign + Daily-Life screens were dropped in 1:1 from the
design handoff. **These are UI shells** — the Daily page renders demo Moments and a
default routine; real persistence is exactly what issues 50–56 wire up.

**Web (`src/`):** replaced `app/(app)/account/page.tsx`, `components/persona-form.tsx`,
`components/questionnaire-form.tsx`; new `app/(app)/daily/page.tsx`,
`components/v2/daily-life-client.tsx`, `domain/daily-types.ts`. Added a **Daily** nav
item to `V2_NAV` in `components/v2/tokens.ts`. Typecheck of these files is clean (the
only `tsc` errors are pre-existing test-harness drift in `tests/03,06,23`, unrelated).

**Mobile (`mobile/`, production):** new `constants/theme.ts`, `components/maya-ui.tsx`,
`components/character-form.tsx`, `app/account.tsx`, `app/daily.tsx`, `app/family/new.tsx`,
`app/characters/new.tsx`, `app/characters/[id].tsx`.

**Still-open wiring (`// TODO:` in the dropped files), folds into the issues:**
- Daily persistence: add a `DayMoment`/Moment store + `createDayMomentAction` and pass
  real rows into `<DailyLifeClient />` → **issue 50**. ("Turn into a story" button →
  prefilled Brief → **issue 55**.)
- Mobile submit handlers are stubbed against `@/lib/api`; mobile needs
  `expo-image-picker` + iOS photo/camera Info.plist strings (see `handoff-mobile/README.md`).
- The drop-in's `domain/daily-types.ts` (`DayMoment`) is the design's shape; reconcile
  with the **Moment** model in issue 50 (light structure: text + date + linked people +
  `significant` flag).

## Part-2 implementation landed (Cursor Composer) — pushed this session

Cursor implemented issues **50–56** against this plan; that work plus the UI wiring
fixes below are all included in this push.

- **Services:** `services/moment.ts`, `services/moment-week.ts`,
  `services/auto-context.ts` (ADR-0019 layer), `services/journal-nudge.ts`.
- **Server actions:** `createMomentAction`, `dismissDailyNudgeAction`,
  `markWeeklySuggestionSeenAction` (in `lib/actions.ts`); `lib/context.ts` wires
  `ctx.moments` / nudge state.
- **Data:** `supabase/migrations/007_journal_moments_extras.sql` (+
  `CONTEXT/local-dev/schema-incremental-004-007.sql`); `domain/types.ts`,
  `db/store.ts`, `db/supabase-store.ts`, `test/fixtures.ts` extended for Moments.
- **UI:** `app/(app)/daily/page.tsx` + `components/v2/daily-life-client.tsx` now
  read real Moments (timeline + weekly spread); `components/v2/world-journal-cards.tsx`
  (daily nudge + weekly-story suggestion on World home); `app/(app)/world/page.tsx`,
  `storybooks/new/page.tsx`, `components/v2/composer.tsx` wired for moment→story.
- **Tests:** `tests/51–56` added. **Full suite: 50 files, 192 tests passing.**
  (`tsc --noEmit` shows 7 type-strictness errors in `tests/03,06,23,54` only —
  pre-existing harness drift, not runtime failures.)

### UI wiring fixes this session (post-drop-in QA)
- `components/nav-links.tsx` — added the **📔 Daily** item to the **live** nav
  (the earlier `V2_NAV` edit was on a dead component; the real nav is `nav-links.tsx`).
- `components/v2/app-shell.tsx` + `globals.css` — the account avatar was a
  non-clickable `<span>`; made it a `<Link href="/account">` so Account is reachable.
- `components/v2/world-journal-cards.tsx` — centered the daily-nudge / weekly
  button rows (`align-items: center`) so the gradient CTA and the borderless
  secondary button line up.

## Notes for the implementer (Cursor Composer)
- Build against the existing v2 design system; **do not** author new visual design.
- Every slice is test-first per the repo's TDD convention; migrations additive +
  reversible; keep the existing test suite green.
- Moments carry no new biometric data → ride the Baby's existing consent +
  hard-delete/purge (ADR-0007); no new consent gate.

## Follow-ups (carried)
- `tsc` strictness in `tests/03,06,23,54` (Inngest private `fn`; roster/persist
  fixture drift; `momentContext` typing) — green at runtime, worth tidying.
- Daily-Life "Edit routine" button is still a placeholder (no action wired).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
