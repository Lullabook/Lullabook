# Device Dev Build — run Lullabook on a physical iPhone

Status: active
Owner: /part1 planning pass, 2026-08-03
Local tickets: 198–201 · GitHub issues: see `index-issues.md`

## Why

Expo Go can no longer run this app. `mobile/` is on Expo SDK 56; the App Store
build of Expo Go ships an older SDK and refuses the project:

```
ERROR  Project is incompatible with this version of Expo Go
The project you requested requires a newer version of Expo Go.
```

Expo Go is a fixed, pre-built binary — it cannot load an SDK it does not
contain, and no newer Expo Go exists to install. The only way onto a physical
device is a **native development build** signed on this machine.

The Simulator path (`npm run ios`) is unaffected and stays the default for
day-to-day work. This effort adds the device path beside it.

## Locked decisions

| # | Decision | Rejected alternative and why |
|---|---|---|
| D1 | Free Apple ID personal team | Paid Apple Developer Program. Not held. Enrolment takes 24–48 h and blocks all progress. Upgrading later is a config change, not a rewrite. |
| D2 | Local `expo prebuild` + `expo run:ios --device` | EAS cloud build. Needs an Expo account and a real `projectId`; `extra.eas.projectId` is still the placeholder `YOUR_EAS_PROJECT_ID`. Adds a queue to every iteration. |
| D3 | `mobile/ios` stays gitignored (Expo CNG) | Committing the Xcode project. `mobile/.gitignore` already ignores `/ios`. Committing it lets `app.config.ts` and the native project drift, and `prebuild --clean` would destroy hand edits. |
| D4 | Strip free-team-blocked entitlements via a `LULLABOOK_FREE_TEAM` env flag in `app.config.ts` | A second `app.config.dev.ts` (two files drift); editing `mobile/ios` after prebuild (wiped by `prebuild --clean`). |
| D5 | The Sign in with Apple button stays visible in free-team builds | Hiding it behind the flag. Accepted as a known dead control, see G1. Keeps `sign-in.tsx` / `sign-up.tsx` untouched by this effort. |
| D6 | The Mac's LAN address is auto-detected at start time | Hardcoding `192.168.50.220` in `mobile/.env`. Breaks silently on any DHCP change or network switch. |
| D7 | Ship a repeatable runbook + `npm` script + doc updates | One-off manual run. The next session would repeat all of this discovery. |

### What a free personal team cannot sign

Apple withholds these capabilities from free teams. Each must be absent from the
free-team dev build or code-signing fails:

- `com.apple.developer.applesignin` — added by the `expo-apple-authentication`
  config plugin.
- `com.apple.developer.associated-domains` — added by
  `ios.associatedDomains: ["applinks:lullabook.app"]`.

`expo-secure-store` and `expo-splash-screen` need no restricted entitlement and
stay in every build. No `expo-notifications` dependency exists, so push
entitlements are not a concern.

## Locked invariants

These are the falsifiable constraints. `/part3` attacks them; `/part4` grades
against them.

### Latency and performance budgets

| # | Invariant |
|---|---|
| **P1** | A warm `npm run ios:device` (native project already generated, no `--clean`) reaches app-launched on the device in **≤ 5 minutes**. |
| **P2** | A cold run (no `mobile/ios`, pods not installed) completes in **≤ 20 minutes**. Beyond that, treat it as a failure and investigate, do not wait. |
| **P3** | LAN address auto-detection adds **≤ 2 seconds** before Metro starts. It is a local interface read, never a network probe or DNS lookup. |
| **P4** | Device cold start to first interactive screen is **measured and recorded once** in the runbook. It is an observation, not a gate — this effort does not own app startup performance. |

### Failure modes

| # | Dependency down / wrong | Required behaviour |
|---|---|---|
| **F1** | No private IPv4 address (Wi-Fi off, Ethernet only, loopback only) | The start script **exits non-zero with a named error** before Metro starts. It must never fall back to `127.0.0.1`, to a stale cached address, or to a public address. Fails closed. |
| **F2** | iPhone absent, unpaired, locked, or trust not granted | `expo run:ios --device` fails with a message naming the expected device. It must **never silently fall back to the Simulator** — a green run against the Simulator while the user watches a blank phone is the worst outcome. |
| **F3** | Backend on port 3002 not running or unreachable | The app surfaces the existing typed network/generation error path. No white screen, no infinite spinner. |
| **F4** | Provisioning profile expired (day 8 of a free-team build) | The runbook states the exact one-command recovery. The app is not deleted and no code is lost; only the signature lapses. |
| **F5** | `LULLABOOK_FREE_TEAM` unset during a free-team device build | Code-signing fails on the missing entitlement. The `ios:device` script must set the flag itself so a human cannot forget it. |
| **F6** | macOS Application Firewall blocks incoming connections to `node` | The runbook names this symptom (phone hangs on "Downloading bundle") and the fix, because it is invisible from the Mac side. |

### Security and permission boundaries

| # | Invariant |
|---|---|
| **S1** | `LULLABOOK_FREE_TEAM` **must never be set** in a production, EAS, or TestFlight build. With the flag unset — the default — the generated config must still contain the `expo-apple-authentication` plugin **and** `ios.associatedDomains`. This is asserted by a test, not by discipline. Losing this silently ships an App Store build with no Sign in with Apple and dead universal links. |
| **S2** | The auto-detected address must be a **private RFC1918 IPv4** address (`10/8`, `172.16/12`, `192.168/16`). Loopback, link-local (`169.254/16`), IPv6, and any public address are rejected. Advertising a public address would expose Metro and the dev backend to the internet. |
| **S3** | `mobile/.env` holds `EXPO_PUBLIC_DEV_EMAIL` / `EXPO_PUBLIC_DEV_PASSWORD`. It is gitignored and must stay so. These credentials must point at a development Supabase project, never production. |
| **S4** | **`npm run dev:all` bypasses safety gates** — it sets `DEV_LIVENESS_BYPASS=true`, `DEV_FORCE_SUBSCRIPTION=active`, and `DEV_FAL_FALLBACK=true`. `AGENTS.md` makes it non-negotiable that no minor's photo reaches storage or training before the consent gate and moderation. Therefore the runbook must carry an explicit warning, **before** the photo-upload step: do not upload a real child's photograph to a bypassed dev stack. Use synthetic or adult test images. |

### Accepted degradations

| # | Behaviour | Why accepted |
|---|---|---|
| **G1** | The Sign in with Apple button renders and fails when tapped. `AppleAuthentication.isAvailableAsync()` reports availability from the native module, which is still linked; it does not check the entitlement. | D5. Email sign-in is the tested path on device. Recorded in the runbook so it is not re-filed as a bug. |
| **G2** | Universal links (`applinks:lullabook.app`) do not open the app from Safari. | The associated-domains entitlement is stripped. The custom `com.lullabook` scheme still works. |
| **G3** | The build must be re-signed every 7 days. | D1, free team. F4 gives the recovery. |

## Out of scope

- TestFlight and App Store distribution — covered by `mobile/TESTFLIGHT-RUNBOOK.md`.
- Any EAS configuration, including replacing the `YOUR_EAS_PROJECT_ID` placeholder.
- Android.
- App startup performance work (see P4).
- Changing `sign-in.tsx` / `sign-up.tsx` (see D5, G1).
