# 39 — Voice in stories + lullaby-weave generation contract

## What to build
Let a story **weave around recorded phrases**: the generation prompt is conditioned on
chosen clips so a member's line lands in-page and the **story ends toward a recorded
lullaby**. Reader plays the relevant member's clip per page.

## Acceptance criteria
- A story generated with a chosen lullaby clip ends on a page that sets up that exact phrase.
- Reader page shows "Hear [name] read this page" and plays the right clip.
- Generation is deterministic/idempotent per page attempt (issue 16 money-safety holds).

## Blocked by
38, 40
