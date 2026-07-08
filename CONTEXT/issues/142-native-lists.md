# 142 — Convert hand-rolled lists to FlatList/SectionList
Status: shipped
Converted the roster, library, and journal from hand-rolled `.map()`-in-`ScrollView` to `FlatList`/`SectionList` with inset separators, swipe actions (e.g. delete a moment/member) where relevant, and row recycling. Reused the `Skeleton` + empty-state components from 139.
(condensed 2026-07-07 — full spec in git history)
