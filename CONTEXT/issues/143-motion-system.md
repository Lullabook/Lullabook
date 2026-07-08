# 143 — Motion system (entrance, animated page-turn, twinkle/float hero)
Status: shipped
Added reanimated motion: card entrance (`FadeInUp`)/layout animations, an animated reader page-turn (replacing the instant `setPageIndex`), and the brand-spec twinkling hero star + floating book cover (named animations `lbTwinkle`/`lbFloat`, per REFERENCE.md).
Invariant: 60fps on the UI thread; the reduce-motion setting degrades all motion to instant/crossfade.
(condensed 2026-07-07 — full spec in git history)
