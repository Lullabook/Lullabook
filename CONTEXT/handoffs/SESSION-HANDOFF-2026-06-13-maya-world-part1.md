# Session Handoff — 2026-06-13: "Maya's World" revamp (/part1)

> Big product pivot planned end-to-end via `/part1`, plus a live visual port of the
> v2 design. Pointer map — read the referenced artifacts, don't re-derive.

## What happened this session

1. **Local run + 4 bug fixes** shipped earlier (see
   `SESSION-HANDOFF-2026-06-13-local-run-and-bugfixes.md`, commit `986c78a`).
2. **v2 design fetched + ported live** to `/world` (`src/app/world/page.tsx`) —
   faithful React port of `Lullabook Redesign v2.dc.html` ("Maya's World"), 6 screens,
   **mock data**, self-contained cream/Baloo 2 theme. Serves 200, no type errors.
3. **Ran `/part1`** on the revamp: grilled the open forks, produced PRD v5 + issues
   34–44, updated the glossary, captured pricing/video/limits research.

## The pivot (locked decisions)

- Lullabook = **a living World starring the baby**, not a bedtime app.
- **Household** = account/consent boundary; owns **multiple Babies**; each Baby = a
  **World**. **Family roster** (reframes Persona) = real people w/ relationship +
  nicknames (per baby–person pair) + photos + **recorded voice clips**. **Characters**
  = fictional-only, free. Naming clash resolved (Family→Household; roster=Family).
- **Voice**: recorded clips only in v1 (no cloning); woven into stories incl. a
  **lullaby-ending weave**.
- **Video**: in v1, but **short per-page ~5-sec clips + narration** (comic/animated),
  not long-form.
- **Monetization/paywall: DEFERRED** — build tier-agnostic, decide the gate after code.

## Artifacts produced

- **PRD:** `CONTEXT/planning/prd-v5-maya-world-revamp.md`
- **Issues:** `CONTEXT/issues/34`–`44` (dependency-ordered tracer bullets; chain below)
- **Glossary:** `CONTEXT/CONTEXT.md` — new "v5 revamp incoming language" section
- **Research:** `CONTEXT/planning/pricing-and-features-2026-06-13.md` — competitor +
  launch + regional pricing, free/paid usage-limit split, and per-page video cost
  (Kling 3.0 on fal.ai ≈ $0.35/clip, ~$2.10/6-page book).
- **Live prototype:** `src/app/world/page.tsx` (`/world`, mock data).

## Issue dependency chain (start here for /part2)

```
34 Household+multi-baby+World ─┬─ 35 Family roster reframe ─┬─ 36 Characters fictional
                               │                            ├─ 40 Broadened Create ─┬─ 41 Short story
                               └─ 37 Apply v2 design        │                       │
            38 Voice record/consent (needs 35) ─────────────┴─ 39 Voice/lullaby weave (needs 38,40)
            42 Video pages (needs 39,41) · 43 World/Stories/Reader real data (needs 37,40) · 44 Multi-baby polish
```
**Next ready issue: `34`** (foundation, unblocked).

## Test / build state

- `npm test` — 132 passing (unchanged this planning pass).
- `/world` + existing routes serve; no new tsc errors in changed files.
- Pre-existing debt in `tests/23` unchanged.

## Honest follow-ups / risks

- The glossary keeps old terms (they still describe current code); new terms are
  flagged "incoming" — the **rename is not done in code**.
- Voice = biometric → issue 38 must extend the consent engine + hard-delete.
- Video model pricing moves monthly — re-confirm before build.
- `/world` is mock-data only; issue 43 wires real data (or promotes it).
- Paywall deferred means issues are length/feature flags, not gated yet.

## Suggested skills for next session

- **`/part2`** — implement from **issue 34** down the chain (test-first).
- **`/grill-with-docs`** — for the still-open forks in PRD §8 (voice-consent UX,
  lullaby-weave contract, video durable-step shape).

## Key refs

- Prior: `SESSION-HANDOFF-2026-06-13-local-run-and-bugfixes.md`
- Design bundle (local, not in repo): `/tmp/lullabook-design/`
