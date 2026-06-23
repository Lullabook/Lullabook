# Lullabook UI Snapshots

A living capture of **every screen in the mobile app** plus a **button→destination
navigation map**. Purpose: hand `NAVIGATION.md` (text) + `screens/*.png` (visuals) to
another model/agent (e.g. GLM 5.2) so it can see exactly what the app looks like and how
it's wired, without running it.

## Contents

| File | What it is | For |
|------|------------|-----|
| `NAVIGATION.md` | Route inventory + every button and where it goes | **GLM 5.2 / agents** (text) |
| `screens/*.png` | One screenshot per route | **Humans** (visual) |
| `refresh.sh` | Re-captures all screens from the running Simulator | maintainers |
| `LAST-REFRESHED.txt` | Timestamp of the last capture | — |

## Refreshing after a UI change

This folder is **not** auto-magic — re-run the script whenever the UI changes:

```bash
# 1. backend (repo root)
npm run dev:paid                 # :3001, subscription forced active

# 2. app (mobile/) — default host; do NOT use --host localhost (binds IPv6-only)
cd mobile && npx expo start --ios --clear

# 3. once the app is up and signed in, capture
CONTEXT/ui-snapshots/refresh.sh
```

The script auto-detects the Metro LAN host, deep-links to each route via
`xcrun simctl openurl`, waits, and writes `screens/<NN>-<name>.png`.

> Want it truly automatic? Add `CONTEXT/ui-snapshots/refresh.sh` as a git
> `pre-commit` hook or a CI step after the Simulator boots.

## Known limitations

- **Dynamic `[id]` routes** (`13-`, `14-`, `15-`) use a placeholder id. On an empty
  account they show the loading / empty / not-found state, not populated data. Once a
  real Storybook / family member / character exists, edit the placeholder ids in
  `refresh.sh` to capture the populated screens.
- **Auth screens** (`01-`, `02-`): the dev build auto-signs-in with `simulator@lullabook.dev`,
  so deep-linking to `/sign-in` may bounce straight to the authed tabs. To capture the real
  sign-in/up screens, sign out first (Settings → Sign out) then run the script.
- Voice record/playback (`14-family-detail`) needs a dev build — see
  `[[lullabook-macos-dupe-files-break-expo-router]]` memory; in Expo Go it degrades gracefully.
