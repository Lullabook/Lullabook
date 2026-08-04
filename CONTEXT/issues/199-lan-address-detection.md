# 199 — Detect the Mac's private LAN address, fail closed when there is none

Triage: ready-for-agent

## Parent

Device Dev Build — `CONTEXT/planning/device-dev-build-iphone.md` (decision D6; invariants P3, F1, S2).

## What to build

A physical iPhone cannot reach `127.0.0.1` on the Mac. Both Metro and
`EXPO_PUBLIC_API_URL` must advertise the Mac's current private LAN address, and that
address changes with DHCP leases and Wi-Fi networks. Hardcoding it breaks silently.

Add `mobile/scripts/lan-address.mjs` exporting a pure function that selects a private
IPv4 address from a list of network interface records, plus a CLI entry point that
prints the selected address to stdout and exits 0, or prints a named error to stderr
and exits non-zero.

Selection reads local interfaces only. It must not perform a DNS lookup, an outbound
connection, or any network probe — this is what keeps it inside the P3 budget.

Rejection is the point of this ticket. Loopback, link-local, IPv6, internal
interfaces, and any address outside RFC1918 are not eligible. When nothing is
eligible the function reports failure; the caller must never substitute a fallback.

## Acceptance criteria

- [ ] The selector returns a `192.168.x.x` address when one is present among the interfaces.
- [ ] The selector returns a `10.x.x.x` address when one is present and no `192.168.x.x` is.
- [ ] The selector returns a `172.16.x.x`–`172.31.x.x` address when present, and rejects `172.15.x.x` and `172.32.x.x` as outside RFC1918.
- [ ] The selector rejects `127.0.0.1` and any interface flagged internal.
- [ ] The selector rejects link-local `169.254.x.x`.
- [ ] The selector rejects IPv6 addresses, including `::1` and a global IPv6 address.
- [ ] The selector rejects a public IPv4 address such as `8.8.8.8`.
- [ ] Given only ineligible interfaces, the selector reports failure rather than returning any address.
- [ ] Given an empty interface list, the selector reports failure.
- [ ] Selection is deterministic: the same interface list always yields the same address.
- [ ] The CLI exits non-zero and writes a message naming the cause to stderr when selection fails, and writes nothing to stdout in that case.
- [ ] The CLI writes only the bare address to stdout on success, with no surrounding prose.

## Verification-command

```bash
npm test -- tests/199-lan-address-detection.test.ts
```

## Blocked by

- Nothing.
