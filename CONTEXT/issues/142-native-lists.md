# 142 — Convert hand-rolled lists to FlatList/SectionList

Triage: ready-for-agent

## Parent
PRD v15 — `CONTEXT/planning/prd-v15-ui-native-polish.md`. Track UI-B.

## What to build
Convert the roster (`family.tsx:81`), library (`stories/index.tsx:79`), and journal
(`daily.tsx:211`) hand-rolled `.map()`-in-ScrollView lists to `FlatList`/`SectionList` with
**inset separators** + **swipe actions** where relevant, recycling rows. Reuse the skeleton +
empty-state components from issue 139.

## Acceptance criteria
- [ ] Roster, library, and journal use `FlatList`/`SectionList` with inset separators and
      smooth recycling.
- [ ] Swipe actions where relevant (e.g. delete a moment / member).
- [ ] Passes `lullabook-design-check`.

## Verification-command
```bash
(cd mobile && npx tsc --noEmit)
```

## Blocked by
139
