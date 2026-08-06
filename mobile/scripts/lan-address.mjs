#!/usr/bin/env node
/**
 * Issue 207 (local ticket 199) — select the Mac's private LAN IPv4 address.
 *
 * Reads local interfaces only (os.networkInterfaces): no DNS lookup, no
 * outbound connection, no network probe (invariant P3). RFC1918 only:
 * 10/8, 172.16/12, 192.168/16. Loopback, link-local, IPv6, internal
 * interfaces, and public addresses are rejected. When nothing is eligible the
 * caller MUST NOT fall back — the CLI exits non-zero with a named error.
 */

import os from "node:os";
import { fileURLToPath } from "node:url";

/**
 * @typedef {{ name: string, address: string, family: "IPv4" | "IPv6", internal: boolean }} NetworkInterfaceRecord
 */

/** Preference order: 192.168/16 first, then 10/8, then 172.16/12. */
const RFC1918_BLOCKS = [
  { label: "192.168/16", test: (a) => /^192\.168\.\d{1,3}\.\d{1,3}$/.test(a) },
  { label: "10/8", test: (a) => /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(a) },
  { label: "172.16/12", test: (a) => {
    const m = /^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(a);
    return !!m && Number(m[1]) >= 16 && Number(m[1]) <= 31;
  } },
];

/** True for an exact IPv4 dotted-quad with every octet in range. */
function isWellFormedIPv4(address) {
  const octets = address.split(".");
  if (octets.length !== 4) return false;
  return octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

/**
 * Pure selector: picks the first eligible address by preference block.
 * Returns null when nothing is eligible (never a fallback address).
 *
 * @param {NetworkInterfaceRecord[]} records
 * @returns {string | null}
 */
export function selectPrivateLanAddress(records) {
  for (const block of RFC1918_BLOCKS) {
    for (const record of records) {
      if (record.internal) continue;
      if (record.family !== "IPv4") continue;
      if (!isWellFormedIPv4(record.address)) continue;
      // Link-local and loopback are not RFC1918 but are excluded explicitly
      // so a mistaken re-block can never admit them.
      if (record.address.startsWith("127.")) continue;
      if (record.address.startsWith("169.254.")) continue;
      if (block.test(record.address)) return record.address;
    }
  }
  return null;
}

/**
 * Flatten os.networkInterfaces() output into the record shape the selector
 * consumes.
 *
 * @param {ReturnType<typeof os.networkInterfaces>} interfaces
 * @returns {NetworkInterfaceRecord[]}
 */
export function parseInterfaces(interfaces) {
  const records = [];
  for (const entries of Object.values(interfaces ?? {})) {
    for (const entry of entries ?? []) {
      records.push({
        name: entry.name ?? "",
        address: entry.address ?? "",
        family: entry.family === "IPv6" ? "IPv6" : "IPv4",
        internal: Boolean(entry.internal),
      });
    }
  }
  return records;
}

function isMain() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === process.argv[1];
  } catch {
    return false;
  }
}

if (isMain()) {
  const address = selectPrivateLanAddress(parseInterfaces(os.networkInterfaces()));
  if (address === null) {
    process.stderr.write(
      "lan-address: no private RFC1918 IPv4 address found on any local interface " +
        "(Wi-Fi off? Ethernet only? loopback only?). Refusing to fall back.\n"
    );
    process.exit(1);
  }
  process.stdout.write(`${address}\n`);
}
