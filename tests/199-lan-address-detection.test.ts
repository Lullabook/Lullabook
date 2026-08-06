import { describe, expect, it } from "vitest";
import {
  selectPrivateLanAddress,
  parseInterfaces,
} from "../mobile/scripts/lan-address.mjs";

/** Issue 207 — RFC1918-only private IPv4 selection (local ticket 199). */
interface NetworkInterfaceRecord {
  name: string;
  address: string;
  family: "IPv4" | "IPv6";
  internal: boolean;
}

const iface = (name: string, address: string, internal = false): NetworkInterfaceRecord => ({
  name,
  address,
  family: address.includes(":") ? "IPv6" : "IPv4",
  internal,
});

describe("199 — LAN address detection (issue 207)", () => {
  it("prefers a 192.168.x.x address when one is present", () => {
    const address = selectPrivateLanAddress([
      iface("en0", "10.0.0.5"),
      iface("en1", "192.168.50.220"),
      iface("en2", "172.20.0.3"),
    ]);
    expect(address).toBe("192.168.50.220");
  });

  it("returns a 10.x.x.x address when present and no 192.168.x.x exists", () => {
    const address = selectPrivateLanAddress([
      iface("en0", "10.11.12.13"),
      iface("en1", "172.20.0.3"),
    ]);
    expect(address).toBe("10.11.12.13");
  });

  it("accepts 172.16–172.31 and rejects 172.15/172.32 as outside RFC1918", () => {
    expect(selectPrivateLanAddress([iface("en0", "172.16.0.1")])).toBe("172.16.0.1");
    expect(selectPrivateLanAddress([iface("en0", "172.31.255.254")])).toBe("172.31.255.254");
    expect(selectPrivateLanAddress([iface("en0", "172.15.0.1")])).toBeNull();
    expect(selectPrivateLanAddress([iface("en0", "172.32.0.1")])).toBeNull();
  });

  it("rejects loopback and internal interfaces", () => {
    expect(selectPrivateLanAddress([iface("lo0", "127.0.0.1")])).toBeNull();
    expect(selectPrivateLanAddress([iface("en0", "192.168.1.2", true)])).toBeNull();
  });

  it("rejects link-local 169.254.x.x", () => {
    expect(selectPrivateLanAddress([iface("en0", "169.254.42.42")])).toBeNull();
  });

  it("rejects IPv6 including ::1 and a global IPv6 address", () => {
    expect(selectPrivateLanAddress([iface("lo0", "::1")])).toBeNull();
    expect(selectPrivateLanAddress([iface("en0", "2606:4700:4700::1111")])).toBeNull();
  });

  it("rejects a public IPv4 address", () => {
    expect(selectPrivateLanAddress([iface("en0", "8.8.8.8")])).toBeNull();
  });

  it("reports failure when only ineligible interfaces exist", () => {
    expect(
      selectPrivateLanAddress([
        iface("lo0", "127.0.0.1"),
        iface("en0", "169.254.1.1"),
        iface("en1", "8.8.8.8"),
      ])
    ).toBeNull();
  });

  it("reports failure on an empty interface list", () => {
    expect(selectPrivateLanAddress([])).toBeNull();
  });

  it("is deterministic: same list always yields the same address", () => {
    const list = [iface("en0", "10.1.2.3"), iface("en1", "192.168.1.9")];
    expect(selectPrivateLanAddress(list)).toBe(selectPrivateLanAddress(list));
  });

  it("parseInterfaces reads names/addresses and flags IPv6", () => {
    const records = parseInterfaces({
      en0: [
        { name: "en0", address: "10.0.0.7", family: "IPv4", internal: false },
        { name: "en0", address: "fe80::1", family: "IPv6", internal: false },
      ],
      lo0: [{ name: "lo0", address: "127.0.0.1", family: "IPv4", internal: true }],
    });
    expect(records.map((r) => r.family)).toEqual(["IPv4", "IPv6", "IPv4"]);
    expect(records.find((r) => r.name === "lo0")?.internal).toBe(true);
  });
});
