/**
 * Type declarations for `lan-address.mjs` (issue 207 / local ticket 199).
 * Kept next to the implementation so the root typecheck can resolve the
 * `.mjs` import from `tests/199-lan-address-detection.test.ts` under
 * `moduleResolution: bundler`. Mirrors the JSDoc in the module.
 */

export interface NetworkInterfaceRecord {
  name: string;
  address: string;
  family: "IPv4" | "IPv6";
  internal: boolean;
}

export function selectPrivateLanAddress(records: NetworkInterfaceRecord[]): string | null;
export function parseInterfaces(
  interfaces: NodeJS.Dict<NodeJS.NetworkInterfaceInfo[]> | undefined,
): NetworkInterfaceRecord[];