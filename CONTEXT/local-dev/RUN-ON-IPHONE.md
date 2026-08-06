# Run Lullabook on a physical iPhone (free Apple ID)

Device Dev Build — `CONTEXT/planning/device-dev-build-iphone.md`. Written for
someone who has **never signed an iOS app**: this Mac started with zero
code-signing identities and zero provisioning profiles, and everything below
was discovered the hard way. Follow it top to bottom once, then
`npm run ios:device` is your daily command.

> **Why Expo Go is dead (SDK 56).** `mobile/` is on Expo SDK 56; the App Store
> build of Expo Go ships an older SDK and refuses the project with "Project is
> incompatible with this version of Expo Go". Expo Go is a fixed pre-built
> binary — it cannot load an SDK it does not contain, and no newer Expo Go
> exists to install. The only way onto a physical device is a **native
> development build** signed on this machine. The Simulator path (`npm run
> ios`) is unaffected and stays the default for day-to-day work.

## §0 Environment bring-up

### §0.1 Prerequisites

- Node 20+ and the root `.env` (backend + Supabase keys).
- Xcode installed and opened once (accept the license).
- The iPhone **unlocked**, near the Mac, on the **same Wi-Fi**, and — on the
  phone — **Settings → Developer** disabled until §1 installs a profile.
- Backend running: `npm run dev:all` (root, port 3002).

### §0.2 Sign in to Xcode with a free Apple ID

1. Open Xcode → **Settings… (⌘,) → Accounts**.
2. Click **+ → Apple ID** and sign in with the free Apple ID.
3. **Team** shows a personal team (your name, "(Personal Team)"). No paid
   Apple Developer Program is needed; the 7-day expiry (§3.1) is the cost.

## §1 First build and install

### §1.1 One command

```bash
cd mobile
npm run ios:device
```

That single command, on its own:

1. Detects the Mac's private LAN address (RFC1918 only — never a loopback,
   public, or stale address). **No usable address → it exits non-zero and
   stops** before Metro starts. See §5.1.
2. Sets `LULLABOOK_FREE_TEAM=1` itself — the free-team entitlement flag — so
   a code-signing failure from a forgotten flag cannot happen.
3. Points the app at the backend at `http://<address>:3002`.
4. Runs `expo prebuild --platform ios` **only when `mobile/ios` is absent**
   (never `--clean`), then `expo run:ios --device`.

Plan it without doing anything:

```bash
cd mobile
npm run ios:device -- --dry-run
```

### §1.2 Trust the developer profile

After the first install the iPhone shows:

> **Untrusted Developer** — "Apple Development: <you>" has not been trusted on
> this iPhone.

Fix: **Settings → General → VPN & Device Management → <Apple Development
profile> → Trust**. The app opens after that. This is a one-time step per Mac.

## §2 Daily use

```bash
npm run dev:all        # terminal 1 — backend (port 3002)
cd mobile
npm run ios:device     # terminal 2 — build + run on the phone
```

The iPhone must be on the same Wi-Fi as the Mac. If the phone hangs on
"Downloading bundle" and the Mac shows nothing, see §5.3 (macOS firewall).

## §3 Known expiry and degradation — expected, not bugs

### §3.1 The 7-day expiry (G3) and its exact recovery (F4)

Free Apple teams re-sign every **7 days**. On day 8 the app still launches but
code-signing is gone; symptoms are a build/install failure mentioning
provisioning or "no profiles". **No code is lost and the app is not deleted.**
The recovery is the same one command:

```bash
cd mobile && npm run ios:device
```

That re-runs prebuild if needed and re-signs with the personal team. If Xcode
reports the profile missing, re-open Xcode → Settings → Accounts first
(§0.2), then run the command again.

### §3.2 Sign in with Apple renders but fails on tap (G1)

The Sign in with Apple button **renders and fails when tapped** on a
free-team build: the `com.apple.developer.applesignin` entitlement is withheld
from free teams and stripped from this build. This is expected and **not a
bug** — do not file it. Use **email sign-in** (the tested path on device).

### §3.3 Universal links do not open the app (G2)

Universal links (`applinks:lullabook.app`) do not open the app from Safari:
the associated-domains entitlement is also stripped in free-team builds. This
is expected — the custom `com.lullabook` URL scheme still works.

## §4 Safety warning — read before any photo upload

> **⚠ WARNING — `npm run dev:all` bypasses safety gates.** It sets
> `DEV_LIVENESS_BYPASS=true`, `DEV_FORCE_SUBSCRIPTION=active`, and
> `DEV_FAL_FALLBACK=true`. Consent gating and moderation are bypassed on this
> stack. **Do not upload a real child's photograph to a bypassed dev stack.**
> Use synthetic or adult test images only.

This warning applies to **every photo upload step in this runbook and in the
app while `dev:all` is running** — including uploading reference photos for a
Persona. The consent gate and moderation are non-negotiable in production
(AGENTS.md); a bypassed dev stack is not the place to test them with real
minors' images.

## §5 Failure modes and fixes

### §5.1 "No LAN address" (F1)

Symptom: `ios-device: no private RFC1918 IPv4 address found (Wi-Fi off?
Ethernet only? loopback only?). Refusing to fall back.` — exit 1 before Metro.

Cause/fix: the Mac needs a private Wi-Fi (or Ethernet) IPv4 address. Turn on
Wi-Fi on the Mac and the phone on the same network, then re-run. The script
never falls back to `127.0.0.1`, a stale address, or a public address.

### §5.2 "Device not found" (F2)

Symptom: `expo run:ios --device` cannot find the iPhone, or it stays on a
blank screen.

Fix: unlock the phone, connect it with a **cable** for the first trust
prompt ("Trust This Computer?" — tap **Trust**), keep it on the same Wi-Fi,
and re-run. `expo run:ios --device` **never silently falls back to the
Simulator** — a green run against the Simulator while the phone is blank is
the worst failure this effort can produce, and the command is built to avoid
it.

### §5.3 macOS Application Firewall blocks `node` (F6)

Symptom: the phone hangs on **"Downloading bundle"** and the Mac shows
nothing. Cause: **System Settings → Network → Firewall** blocks incoming
connections to `node`.

Fix: System Settings → Network → Firewall → **Options** → allow incoming
connections for `node` (or add it). Re-run `npm run ios:device`.

## §6 Measured cold start (P4)

Cold start = time from tapping the app icon on the device to the first
interactive screen.

**Measured figure: not yet recorded.** The first real device run must append
the stopwatch figure here (observation, not a gate — this effort does not own
app startup performance):

```
First device cold start (date, device, iOS version): ___ seconds
```

## §7 Index

- Plan + invariants: `CONTEXT/planning/device-dev-build-iphone.md`
- Free-team flag: `LULLABOOK_FREE_TEAM` in `mobile/app.config.ts`
- Address detection: `mobile/scripts/lan-address.mjs`
- Device command: `mobile/scripts/ios-device.mjs`
