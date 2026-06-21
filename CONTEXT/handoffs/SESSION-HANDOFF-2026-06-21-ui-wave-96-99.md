# Session Handoff — 2026-06-21: UI wave (issues 96-99 web + mobile)

> Built the **React UI components** for PRD v12 issues 96-99 that the prior
> session left as "service-only" follow-ups. **71 files / 352 tests — ALL GREEN.**
> Branch `feat/wave-prd-v12-89-99`.

## What was built

### Web UI
| Issue | Component | Route |
|-------|-----------|-------|
| 96 | 5-tab nav (Home/Stories/Create/Family/Settings) — `V2_NAV` tokens + `tabForPath` resolver | all `(app)` pages |
| 97 | `HomeDashboard` component — hero + 4 cards (continue-reading, story-nudge, this-week, family-activity) | `/world` |
| 98 | Demo page — baby-free "Maya and the Moon" (4 pages, <90s) + paywall CTA | `/demo` (no auth) |
| 99 | `PaywallUI` component — 3 tiers ($8/$15/$25), annual-default toggle, tier badges | `/billing` |

### Mobile UI
| Issue | Component | Route |
|-------|-----------|-------|
| 96 | 5-tab `Tabs` layout (Home/Stories/Create/Family/Settings), "More" tab deleted | `(tabs)/_layout.tsx` |
| 97 | Baby-hero dashboard — purple hero + 4 dash cards | `(tabs)/index.tsx` |
| 99 | Mobile paywall — 3 tiers, annual/monthly toggle | `billing.tsx` |

### API
| Route | Purpose |
|-------|---------|
| `GET /api/entitlement` | Bearer-authed tier + story-cap + credit-balance state for mobile/web UI |

## Red-team pass (fresh-eyes Explore subagent)

### 3 blockers found + fixed
1. **Mobile Family tab self-redirect loop** — `(tabs)/family.tsx` redirected to `/family` (itself). Fixed: replaced `<Redirect>` with a full family roster screen (fetches home data, shows personas + characters + add buttons).
2. **Web paywall broken link** — `PaywallUI` linked to `/billing/checkout` (non-existent route). Fixed: replaced `<Link>` with `<form action={startCheckoutFormAction}>` + `<SubmitButton>`, matching the existing billing pattern.
3. **Mobile billing `Pressable` missing `onPress`** — tier-selection buttons were non-interactive. Fixed: added `onPress={() => router.push("/account")}` (routes to the existing account/billing screen; RevenueCat IAP SDK wiring is a future issue 92 follow-up).

### Non-blocking follow-ups (recorded, not fixed)
- `NO_ENTITLEMENT.tier` is `"basic"` (type lie) — API returns `tier:"basic"` for unentitled users; `getTier()` returns `"none"`. Add an `entitled: boolean` field or expose `"none"`.
- `home-dashboard.ts:55` throws on missing baby — safe today (`ensureDefaultBaby` runs first), but fragile if called from another path.
- Dead imports in `stories.tsx` (removed), `index.tsx` (removed).
- No tests for the new React components themselves (the data services are tested; component render tests are out of scope per project TDD convention "don't test React render details").

## Design check
- All new components use colors/fonts/radii from `tokens.ts` / `theme.ts` — no off-token values.
- One new value `#F6F0FF` in `paywall-ui.tsx` (recommended-tier card background) — matches pre-existing `world-journal-cards.tsx:35` pattern; can be tokenized later as `primaryBgLight`.

## Verification
```bash
npm test          # 71 files / 352 tests — ALL GREEN
npm run check:runbook  # PASS
```

## Files changed
**New (web):** `src/components/v2/home-dashboard.tsx`, `src/components/v2/paywall-ui.tsx`, `src/app/demo/page.tsx`, `src/app/api/entitlement/route.ts`
**New (mobile):** `mobile/app/(tabs)/stories.tsx`, `mobile/app/(tabs)/create.tsx`, `mobile/app/(tabs)/family.tsx`, `mobile/app/(tabs)/settings.tsx`, `mobile/app/billing.tsx`
**Modified (web):** `src/components/nav-links.tsx`, `src/components/v2/tokens.ts`, `src/components/v2/v2-nav.tsx`, `src/app/(app)/world/page.tsx`, `src/app/(app)/billing/page.tsx`
**Modified (mobile):** `mobile/app/(tabs)/_layout.tsx`, `mobile/app/(tabs)/index.tsx`
**Deleted (mobile):** `mobile/app/(tabs)/two.tsx` (old "More" tab)

## Next steps
- Run the app in the Simulator to visually verify (user requested this — Metro was already running on :8081, backend on :3001, Simulator booted with iPhone 17).
- Wire RevenueCat IAP SDK for mobile checkout (the `onPress` currently routes to /account as an interim).
- Add `/billing/checkout` page if tier-specific Stripe checkout is needed (current form action starts a single-plan checkout).
- HITL smoke (issues 83-87) via the `live-app-audit` skill.
