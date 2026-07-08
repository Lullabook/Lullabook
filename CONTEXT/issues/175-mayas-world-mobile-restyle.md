# 175 — Maya's World mobile restyle (merge web look with sim practicality)

Triage: ready-for-agent (done — shipped in `feat/mayas-world-restyle`)

## Parent
User QA with side-by-side screenshots of web vs simulator: "I like the look of web but
the practicality of the sim — merge it all." Design canon:
`.claude/skills/lullabook-design` (Maya's World v2).

## What to build
1. Restyle every mobile screen to the Maya's World canon (cream/twilight palette, Baloo
   titles, plum-tinted shadows) while keeping the sim's layout practicality: home,
   create, family (list/detail/new), settings, stories (shelf + detail), billing,
   characters, daily, sign-in, sign-up, character-form.
2. Shared `mobile/components/story-cover.tsx` — `BOOK_SKIES` gradient covers with
   `TYPE_LABEL`/`STATUS_LABEL` chips, used by the stories shelf and detail header.
3. Stories shelf: storybook-style shelf rows; detail screen gets cover-thumb header.

## Acceptance criteria
- [x] All listed screens use canon tokens; no ad-hoc colors/fonts remain.
- [x] Stories shelf + detail share one cover component (no duplicated gradient logic).
- [x] `npx tsc --noEmit` clean.

## Done
Shipped in commit `e54acbe` (16 files, +1147/−364). Closed on GitHub.
