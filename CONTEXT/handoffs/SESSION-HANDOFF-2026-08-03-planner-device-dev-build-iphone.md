# Session Handoff — 2026-08-03: /planner device dev build (iPhone 17)

Status: active
Stage: /planner planning complete. Next stage is /coder, starting at GitHub issue #206.

## What triggered this

The user connected an iPhone 17 to the MacBook and asked to run Lullabook on it.
The Expo Go path was attempted first and is **dead**: `mobile/` is on Expo SDK 56,
and the App Store build of Expo Go refuses the project with "Project is incompatible
with this version of Expo Go". Expo Go is a fixed binary; no newer version exists to
install. A native development build is the only route onto the device.

No application code was written this session. Planning artifacts only.

## Where to start

`CONTEXT/planning/device-dev-build-iphone.md` — the spec, seven locked decisions,
and the locked invariants (P1–P4 budgets, F1–F6 failure modes, S1–S4 boundaries,
G1–G3 accepted degradations).

## Locked decisions

| # | Decision |
|---|---|
| D1 | Free Apple ID personal team. No paid membership. 7-day provisioning. |
| D2 | Local `expo prebuild` + `expo run:ios --device`. No EAS. |
| D3 | `mobile/ios` stays gitignored. Expo CNG; `app.config.ts` is the source of truth. |
| D4 | `LULLABOOK_FREE_TEAM=1` env flag strips the entitlements a free team cannot sign. |
| D5 | The Sign in with Apple button stays visible and dead in free-team builds. `sign-in.tsx` / `sign-up.tsx` untouched. |
| D6 | The Mac's LAN address is auto-detected, never hardcoded. |
| D7 | Deliverable is a repeatable runbook plus an `npm` script, not a one-off. |

## The slice order

| Local | GitHub | Status | Slice |
|---|---|---|---|
| 198 | [#206](https://github.com/VrajGupta/Lullabook/issues/206) | **Agent Ready** | Gate free-team-blocked entitlements behind `LULLABOOK_FREE_TEAM` |
| 199 | [#207](https://github.com/VrajGupta/Lullabook/issues/207) | **Agent Ready** | Detect the private LAN address, fail closed when there is none |
| 200 | [#208](https://github.com/VrajGupta/Lullabook/issues/208) | Planned | `npm run ios:device` — blocked by #206, #207 |
| 201 | [#209](https://github.com/VrajGupta/Lullabook/issues/209) | Planned | Runbook + doc corrections — blocked by #208 |

`/coder` starts at **#206**. #206 and #207 are independent of each other.

## The two invariants most likely to be broken

- **S1** — with `LULLABOOK_FREE_TEAM` unset, the config must **still** carry the
  `expo-apple-authentication` plugin and `ios.associatedDomains`. Losing this
  silently ships an App Store build with no Sign in with Apple and dead universal
  links. Ticket 198 asserts it by test, not by discipline.
- **F2** — `expo run:ios --device` must never fall back to the Simulator. A green
  run against the Simulator while the phone stays blank is the worst outcome this
  effort can produce.

## S4 — the safety warning that must survive into the runbook

`npm run dev:all` sets `DEV_LIVENESS_BYPASS=true`, `DEV_FORCE_SUBSCRIPTION=active`,
and `DEV_FAL_FALLBACK=true`. `AGENTS.md` makes it non-negotiable that no minor's
photo reaches storage or training before the consent gate and moderation. The
runbook (ticket 201) must therefore warn, **before** the first photo-upload step,
that no real child's photograph may be uploaded to a bypassed dev stack.

## Machine state left behind

Facts a later session should not re-derive:

- Device paired: `Vraj's iPhone 17`, `F83F0CA5-7430-58AE-8E48-533C8F02526C`,
  `iPhone18,3`, state `available (paired)` per `xcrun devicectl list devices`.
- Xcode 26.6 (17F113). `xcode-select` → `/Applications/Xcode.app/Contents/Developer`.
- **CocoaPods 1.17.0 installed this session** via Homebrew. It was missing.
- **Zero code-signing identities and zero provisioning profiles.** No Apple ID is
  signed into Xcode yet. The runbook must cover first-time signing from nothing.
- `mobile/ios` does **not** exist. `expo prebuild` has not been run.
- LAN wiring proven: Mac at `192.168.50.220`; Metro binds `*:8081` and answers over
  LAN; `dev:all` on `:3002` answers over LAN; the Expo manifest reported the correct
  `hostUri` and `apiUrl`. The `CONTEXT/state.md` gotcha about Metro binding `[::1]`
  only **did not reproduce** with `expo start --host lan` — the
  `ipv4-metro-proxy.mjs` workaround was not needed.
- macOS Application Firewall is enabled, block-all disabled. Incoming connections
  to `node` may need allowing; this is invisible from the Mac side (F6).
- `mobile/.env` `EXPO_PUBLIC_API_URL` was edited from `http://127.0.0.1:3002` to
  `http://192.168.50.220:3002` during the Expo Go attempt. The original is saved at
  `mobile/.env.device-backup`. **Ticket 200 removes the need for this edit** — the
  script supplies the address through the environment. Restore the backup before
  using the Simulator flow.

## Not addressed

- `extra.eas.projectId` is still `YOUR_EAS_PROJECT_ID`; `eas.json`'s submit block
  still holds placeholder Apple credentials. Out of scope — see
  `mobile/TESTFLIGHT-RUNBOOK.md`.
- The six blockers in `DEBUG-AUDIT-2026-07-21-r1-176-185.md` are untouched.
