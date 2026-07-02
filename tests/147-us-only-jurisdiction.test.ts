import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ConsentEngine } from "@/services/consent-engine";
import { isMarketEnabled, isR1UsOnly, R1_US_MARKETS } from "@/lib/r1-config";

/**
 * Issue 147 — US-only jurisdiction for R1.0.
 *
 * The multi-jurisdiction engine is config-driven but only the US market is
 * enabled for R1.0. Asia slots stay in the config (flag-disabled) so R1.1
 * enables them by data change, not a rebuild. A non-US request rides the same
 * config path (clean "not available in your region" or US default), never a
 * crash. No hardcoded US values scattered in code — all from config.
 */

const baseSignup = {
  actorRole: "guardian" as const,
  action: "signup" as const,
  hasActiveSubscription: false,
  hasConsentReceipt: false,
};

describe("147 — US-only R1.0: config-driven, Asia flag-disabled", () => {
  beforeEach(() => { delete process.env.R1_US_ONLY; });
  afterEach(() => { delete process.env.R1_US_ONLY; });

  it("isR1UsOnly() is false by default (R2 / pre-cut)", () => {
    expect(isR1UsOnly()).toBe(false);
  });

  it("isR1UsOnly() is true when R1_US_ONLY=true", () => {
    process.env.R1_US_ONLY = "true";
    expect(isR1UsOnly()).toBe(true);
  });

  it("R1_US_MARKETS contains US and US_IOS only", () => {
    expect(R1_US_MARKETS.has("US")).toBe(true);
    expect(R1_US_MARKETS.has("US_IOS")).toBe(true);
    expect(R1_US_MARKETS.has("IN")).toBe(false);
  });

  it("Asia config slots exist and are flag-disabled (enabling later = data change)", () => {
    process.env.R1_US_ONLY = "true";
    const asia = ConsentEngine.listJurisdictions().filter((j) => ["IN", "KR", "SG", "JP"].includes(j.code));
    expect(asia.length).toBe(4);
    // The slots exist in config (R1.1 enables by flipping the flag, not a rebuild).
    for (const j of asia) {
      expect(j.code).toMatch(/^(IN|KR|SG|JP)$/);
    }
    // Under US-only, none of the Asia markets are enabled.
    for (const j of asia) {
      expect(isMarketEnabled(j.code, j.enabled)).toBe(false);
    }
  });

  it("listEnabledJurisdictions returns only US markets under US-only", () => {
    process.env.R1_US_ONLY = "true";
    const enabled = ConsentEngine.listEnabledJurisdictions();
    expect(enabled.every((j) => R1_US_MARKETS.has(j.code))).toBe(true);
    expect(enabled.find((j) => j.code === "IN")).toBeUndefined();
  });

  it("listEnabledJurisdictions respects per-market flags when US-only is off (R2)", () => {
    const enabled = ConsentEngine.listEnabledJurisdictions();
    // Pre-cut: US, US_IOS, IN, STRICT are enabled; KR/SG/JP are flag-disabled.
    expect(enabled.map((j) => j.code).sort()).toEqual(["IN", "STRICT", "US", "US_IOS"]);
  });
});

describe("147 — non-US request: clean message, never a crash", () => {
  beforeEach(() => { process.env.R1_US_ONLY = "true"; });
  afterEach(() => { delete process.env.R1_US_ONLY; });

  it("signup from a non-US market is rejected with a clean reason (no crash)", () => {
    const engine = new ConsentEngine();
    const res = engine.check({ ...baseSignup, jurisdiction: "IN" });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/not available/i);
  });

  it("signup from an unknown jurisdiction resolves to US default + not-enabled (no crash)", () => {
    const engine = new ConsentEngine();
    const res = engine.check({ ...baseSignup, jurisdiction: "XX" });
    expect(res.allowed).toBe(false);
    expect(res.reason).toMatch(/not available|unknown/i);
  });

  it("signup from the US market is allowed", () => {
    const engine = new ConsentEngine();
    const res = engine.check({ ...baseSignup, jurisdiction: "US" });
    expect(res.allowed).toBe(true);
  });

  it("resolveMarketOrDefault never returns undefined config (US default fallback)", () => {
    const { config, enabled } = ConsentEngine.resolveMarketOrDefault("ZZ");
    expect(config).toBeDefined();
    expect(config.code).toBe("US");
    expect(enabled).toBe(true);
  });

  it("US-only consent values come from config, not hardcoded (childAge, method, region)", () => {
    const us = ConsentEngine.getJurisdiction("US")!;
    expect(us.childAgeThreshold).toBe(13);
    expect(us.consentMethod).toBe("payment_vpc");
    expect(us.residencyRegion).toBe("us-east-1");
    expect(us.noticeVersion).toBe("us-coppa-v1");
  });
});
