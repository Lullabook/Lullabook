# 200 — Add `npm run ios:device`, a one-command device build that cannot mis-target

Triage: ready-for-agent

## Parent

Device Dev Build — `CONTEXT/planning/device-dev-build-iphone.md` (decisions D2, D3, D7; invariants P1, P2, F1, F2, F5, S2).

## What to build

One command that takes a connected iPhone from nothing to a running app, composing
ticket 198's entitlement flag and ticket 199's address detection so a human cannot
forget either.

Add `mobile/scripts/ios-device.mjs` and wire it as `ios:device` in
`mobile/package.json`. The script plans the run in a pure, testable function that
returns the environment and the command to execute; a thin wrapper executes that plan.
Support `--dry-run`, which prints the resolved plan and exits 0 without invoking
Xcode, prebuild, or Metro.

The plan must:

1. Resolve the private LAN address via ticket 199. On failure, exit non-zero and stop.
   Never continue with a loopback or stale address.
2. Set `LULLABOOK_FREE_TEAM=1` itself, so a free-team signing failure cannot be caused
   by a forgotten flag.
3. Set `EXPO_PUBLIC_API_URL` to `http://<address>:3002` and
   `REACT_NATIVE_PACKAGER_HOSTNAME` to the same address.
4. Run `expo prebuild --platform ios` only when `mobile/ios` is absent. An existing
   native project is never regenerated implicitly, because `prebuild --clean`
   discards native state.
5. Run `expo run:ios --device` with the device explicitly targeted.

Targeting is a correctness requirement, not a convenience. Invariant F2 forbids a
silent fall back to the Simulator: a run that reports success while the phone stays
blank is the worst failure this effort can produce.

Do not hardcode `192.168.50.220` anywhere. Do not modify `mobile/.env`; the script
supplies the address through the environment so the checked-out file stays neutral.

## Acceptance criteria

- [ ] `npm run ios:device -- --dry-run` exits 0 and prints the resolved plan without starting Metro, prebuild, or Xcode.
- [ ] The planner sets `LULLABOOK_FREE_TEAM` to exactly `"1"` in the returned environment.
- [ ] The planner sets `EXPO_PUBLIC_API_URL` to `http://<detected-address>:3002`.
- [ ] The planner sets `REACT_NATIVE_PACKAGER_HOSTNAME` to the detected address, with no scheme and no port.
- [ ] Given a failed address detection, the planner returns a failure and the returned plan contains no command to execute.
- [ ] Given a failed address detection, the resolved environment contains no `EXPO_PUBLIC_API_URL` key at all, rather than a loopback or empty value.
- [ ] Given `mobile/ios` absent, the plan includes a `prebuild` step before the run step.
- [ ] Given `mobile/ios` present, the plan omits the `prebuild` step.
- [ ] The plan never includes `--clean` on the prebuild step.
- [ ] The run step targets a physical device and contains no Simulator target.
- [ ] No source file in `mobile/scripts/` contains the literal string `192.168.50.220`.
- [ ] The script does not write to `mobile/.env`.

## Verification-command

```bash
npm test -- tests/200-ios-device-launch-script.test.ts && cd mobile && npm run ios:device -- --dry-run
```

## Blocked by

- GitHub issue #206 (local ticket 198) — `LULLABOOK_FREE_TEAM` flag
- GitHub issue #207 (local ticket 199) — LAN address detection
