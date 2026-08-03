# 198 — Gate free-team-blocked iOS entitlements behind LULLABOOK_FREE_TEAM

Triage: ready-for-agent

## Parent

Device Dev Build — `CONTEXT/planning/device-dev-build-iphone.md` (decisions D1, D4; invariant S1).

## What to build

A free Apple ID personal team cannot issue `com.apple.developer.applesignin` or
`com.apple.developer.associated-domains`. A device build that declares either one
fails at code-signing. Add a single env-gated branch to `mobile/app.config.ts` so a
free-team dev build omits both, while the default (flag unset) production config is
byte-for-byte unchanged.

Read the env flag `LULLABOOK_FREE_TEAM`. Treat only the exact string `"1"` as on;
every other value, including `"true"`, `"0"`, and unset, is off. Off is the default
and is the production configuration.

When on, omit the `expo-apple-authentication` entry from `plugins` and omit
`ios.associatedDomains`. Change nothing else — `bundleIdentifier`, `scheme`,
`infoPlist`, `expo-router`, `expo-secure-store`, and `expo-splash-screen` are
identical in both modes.

Do not modify `app/sign-in.tsx` or `app/sign-up.tsx`. Decision D5 accepts the Sign
in with Apple button remaining visible and failing on tap in free-team builds.

## Acceptance criteria

- [ ] With `LULLABOOK_FREE_TEAM` unset, the resolved config's `plugins` contains `"expo-apple-authentication"`.
- [ ] With `LULLABOOK_FREE_TEAM` unset, the resolved config's `ios.associatedDomains` equals `["applinks:lullabook.app"]`.
- [ ] With `LULLABOOK_FREE_TEAM="1"`, the resolved config's `plugins` does not contain `"expo-apple-authentication"`.
- [ ] With `LULLABOOK_FREE_TEAM="1"`, the resolved config has no `ios.associatedDomains` key.
- [ ] With `LULLABOOK_FREE_TEAM="1"`, `ios.bundleIdentifier` is still `"com.lullabook.app"` and `scheme` is still `"com.lullabook"`.
- [ ] With `LULLABOOK_FREE_TEAM="true"`, the config matches the unset case exactly, proving only `"1"` enables the branch.
- [ ] With `LULLABOOK_FREE_TEAM="1"`, `plugins` still contains `"expo-router"`, `"expo-secure-store"`, and the `expo-splash-screen` entry.
- [ ] `mobile/.env.example` documents `LULLABOOK_FREE_TEAM` with a comment stating it must never be set for a production or TestFlight build.

## Verification-command

```bash
npm test -- tests/198-free-team-entitlement-flag.test.ts
```

## Blocked by

- Nothing.
