# 201 — Write the iPhone runbook and correct the docs that still promise Expo Go

Triage: ready-for-agent

## Parent

Device Dev Build — `CONTEXT/planning/device-dev-build-iphone.md` (decision D7; invariants F1, F2, F4, F6, P4, S3, S4; degradations G1, G2, G3).

## What to build

The knowledge that produced this effort must survive the session. Write
`CONTEXT/local-dev/RUN-ON-IPHONE.md` and add a checker script that fails when the
runbook drifts, mirroring `scripts/check-hitl-runbook.mjs`.

The runbook must be usable by someone who has never signed an iOS app, because that
is the actual situation: this Mac currently has zero code-signing identities and zero
provisioning profiles.

It must cover, at minimum:

- Signing in to Xcode with a free Apple ID and selecting the personal team.
- Trusting the developer profile on the iPhone, under Settings, after the first install.
- The single `npm run ios:device` command.
- The 7-day expiry (G3) and its exact one-command recovery (F4), stating plainly that
  no code is lost and the app is not deleted.
- Sign in with Apple renders but fails on tap (G1), and universal links do not open
  the app (G2). Both are expected, neither is a bug.
- The symptom and fix for a macOS firewall block on `node` (F6), because the phone
  simply hangs on "Downloading bundle" and the Mac shows nothing.
- What "no LAN address" (F1) and "device not found" (F2) look like, and what to do.
- A measured, recorded device cold-start figure (P4).

**Warning placement is a hard requirement.** Per `CLAUDE.md`, a warning precedes its
instruction. The S4 warning — `npm run dev:all` bypasses liveness, moderation-adjacent
gates, and subscription checks, so no real child's photograph may be uploaded to it —
must appear **before** the first step that uploads a photo, never after it.

Also correct the documents that now point at a dead path:

- `mobile/README.md` — the "Run in simulator" section must gain a device section, and
  the Expo Go instruction must be removed or marked dead with the reason.
- `CONTEXT/state.md` — record that Expo Go is dead for SDK 56 and that `ios:device`
  is the device path.
- Regenerate the retrieval indexes, since `CONTEXT/` gained files.

## Acceptance criteria

- [ ] `CONTEXT/local-dev/RUN-ON-IPHONE.md` exists.
- [ ] `scripts/check-iphone-runbook.mjs` exits 0 when the runbook is complete and non-zero when a required section is missing.
- [ ] The checker asserts the S4 photo warning appears at an earlier line number than the first photo-upload step.
- [ ] The checker fails if the runbook contains any literal secret value, matching the rule already enforced by `scripts/check-hitl-runbook.mjs`.
- [ ] The checker verifies every file path and npm script the runbook cites actually exists.
- [ ] The runbook documents the 7-day expiry and its recovery command.
- [ ] The runbook documents the Sign in with Apple dead control (G1) and the universal-link gap (G2) as expected behaviour.
- [ ] The runbook documents the macOS firewall symptom and fix (F6).
- [ ] `mobile/README.md` no longer instructs the reader to use Expo Go, and states why.
- [ ] `CONTEXT/state.md` records that Expo Go cannot run SDK 56 and names `npm run ios:device` as the device path.
- [ ] `npm run graph:index -- --check` exits 0, proving the generated indexes match the files on disk.

## Verification-command

```bash
node scripts/check-iphone-runbook.mjs && npm run graph:index -- --check && npm test -- tests/201-iphone-runbook-and-docs.test.ts
```

## Blocked by

- GitHub issue #208 (local ticket 200) — `npm run ios:device`
