# Session Handoff — 2026-06-15: mobile 500 fix, env wiring, Maya's World design pass

> Branch: `plan/photo-stories-firsts-birthday-64-73`. This session was operational
> (run the iOS app locally) + a mobile design-fidelity pass. No domain/service logic
> changed; web tests untouched.

## What happened

1. **First-run iOS setup.** Xcode was installed but living in `~/Downloads`; moved to
   `/Applications/Xcode.app`, ran `xcode-select -s`, booted the Simulator. Added the
   `xcode-ios-dev` Cursor subagent (committed earlier as `67447a5`).

2. **`request fails 500` root cause = stale `.next` build cache** (not Supabase).
   Web dev server was serving a corrupt build (`routes-manifest.json` ENOENT,
   `Cannot find module './5611.js'`). Fix: `rm -rf .next .next-free .next-paid`,
   restarted `npm run dev` clean on `:3000`. `/api/home` now returns `401`
   (expected without a Bearer token), `/` returns `200`.

3. **Mobile Supabase env wiring.** App crashed at import with `supabaseUrl is required`.
   - `mobile/lib/env.ts` (new) — central getters for Supabase URL/key + API URL, with
     `requireSupabaseConfig()` throwing a helpful message.
   - `mobile/lib/supabase.ts` — lazy `Proxy` client so route modules don't crash at
     import time when config is missing.
   - `mobile/app.config.ts` — reads `mobile/.env` then falls back to repo-root
     `.env.local`, mapping `NEXT_PUBLIC_SUPABASE_*` → `EXPO_PUBLIC_*`, and exposes
     them via `extra`.
   - `expo-image-picker` was missing from `family/new.tsx`'s imports → installed via
     `npx expo install expo-image-picker`.

4. **Maya's World design pass (mobile).** The kit (`constants/theme.ts` `C`/`R`,
   `components/maya-ui.tsx`) already matched tokens; the drift was in screens still on
   the old brown palette + the default Expo tab template. Updated:
   - `app/(tabs)/_layout.tsx` — replaced Expo "Tab One/Two" code-icon tabs with
     themed tabs (cream surface, purple active tint, 💛 Home / ✨ More emoji icons).
   - `app/(tabs)/two.tsx` — replaced template screen with a real "More" hub linking
     to Daily, Characters, Add family, Account.
   - `app/(tabs)/index.tsx` — home migrated to `Screen/Eyebrow/PageTitle/Card` + tokens.
   - `app/sign-in.tsx`, `app/sign-up.tsx` — rebuilt on the kit (cream bg, eyebrow→title→
     lead scaffold, pill buttons, plum shadow hero, `C.danger` errors).
   - `constants/Colors.ts` — brand tints (`#6A55C9` / night-panel dark).
   - `components/roster-avatar.tsx` — uses `getApiUrl()`.
   - `app.config.ts` splash bg `#FFF8F0` → `#FBF4E7`.

## State

- `npx tsc --noEmit` (mobile): clean except **pre-existing** `ExternalLink.tsx` typed-route
  error and the shared `../src/domain/*` path-alias noise (both predate this session).
- Expo bundles clean on the Simulator (`iOS Bundled … 1681 modules`, no Supabase errors).
- Tokens source of truth unchanged: `src/components/v2/tokens.ts` ↔ `mobile/constants/theme.ts`.

## Not done / follow-ups

- Brand **fonts** (Baloo 2 / Nunito) still not loaded on mobile — screens use system
  font. Loading `@expo-google-fonts/*` + wiring `fontFamily` is a separate pass.
- `app/+html.tsx` keeps `background-color:#000` (web-export shell only; not the iOS app).
- `app/modal.tsx` still template (no longer reachable after the tab-header link removal).
- Mobile submit handlers in `family/new.tsx`, `character-form.tsx`, `account.tsx`,
  `daily.tsx` are still TODO-stubbed against the API (pre-existing).

## Suggested skills for the next session

- **lullabook-design-check** — re-lint the mobile screens after the font pass.
- **hermes** — live E2E across free + paid tiers (next deliverable is an app-audit skill
  that drives hermes; see below).
- **write-a-skill** — the next task is authoring a full-site live-audit skill.
