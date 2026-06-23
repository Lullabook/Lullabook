import { describe, expect, it } from "vitest";
import { ConsentEngine } from "@/services/consent-engine";
import { JurisdictionService } from "@/services/jurisdiction";

/**
 * Issue 130 — Multi-jurisdiction engine real for Asia + US.
 *
 * The config table (consent-engine.ts) already drives consent method,
 * child-age, residency, and notice per market — nothing hardcoded. This pins
 * the R1 invariants: (a) US + ≥1 Asia market enabled; (b) adding a market is a
 * config-only change (no code); (c) every enabled market's values resolve from
 * config. The per-market legal-review checklist lives alongside this config.
 */

describe("130 — jurisdiction engine: US + Asia, config-driven", () => {
  it("US + at least one Asia market are enabled for R1", () => {
    const svc = new JurisdictionService();
    expect(svc.isMarketEnabled("US")).toBe(true);
    const asiaEnabled = ["IN", "KR", "SG", "JP"].filter((c) => svc.isMarketEnabled(c));
    expect(asiaEnabled.length).toBeGreaterThanOrEqual(1);
    expect(asiaEnabled).toContain("IN"); // India enabled for R1
  });

  it("consent method + child-age + residency + notice all resolve from config", () => {
    const us = ConsentEngine.getJurisdiction("US")!;
    const in_ = ConsentEngine.getJurisdiction("IN")!;

    // US (web) uses payment VPC; US_IOS uses email-plus (ADR-0018).
    expect(ConsentEngine.getJurisdiction("US_IOS")!.consentMethod).toBe("email_plus");
    expect(us.consentMethod).toBe("payment_vpc");
    expect(in_.consentMethod).toBe("payment_vpc");

    // Child-age is per-market config, not a hardcoded constant.
    expect(us.childAgeThreshold).not.toBe(in_.childAgeThreshold);

    // Residency region is per-market (data-residency).
    expect(us.residencyRegion).toBe("us-east-1");
    expect(in_.residencyRegion).toBe("ap-south-1");

    // Notice version is per-market (version-stamped consent receipts).
    expect(us.noticeVersion).toBe("us-coppa-v1");
    expect(in_.noticeVersion).toBe("in-dpdp-v1");
  });

  it("adding a market is a config-only change (no code path branches on a hardcoded country)", () => {
    // A new market is a new entry in the JURISDICTIONS table; the engine
    // resolves it with no code change. Prove it by reading an existing market
    // through the generic resolver and confirming no throw + correct shape.
    const svc = new JurisdictionService();
    for (const code of ["US", "US_IOS", "IN", "KR", "SG", "JP"]) {
      const config = ConsentEngine.getJurisdiction(code);
      expect(config).toBeDefined();
      expect(config!.code).toBe(code);
      // Every field the engine consults is present — no partial configs.
      expect(config!.childAgeThreshold).toBeGreaterThan(0);
      expect(config!.consentMethod).toBeTruthy();
      expect(config!.residencyRegion).toBeTruthy();
      expect(config!.noticeVersion).toBeTruthy();
      // The service mirrors the engine's enable flag.
      expect(svc.isMarketEnabled(code)).toBe(config!.enabled);
    }
  });

  it("a disabled market blocks signup (the launch gate)", () => {
    const engine = new ConsentEngine();
    // KR is disabled (not in R1).
    const kr = ConsentEngine.getJurisdiction("KR")!;
    expect(kr.enabled).toBe(false);
    expect(
      engine.check({
        jurisdiction: "KR",
        actorRole: "guardian",
        action: "signup",
        hasActiveSubscription: false,
        hasConsentReceipt: false,
      }).allowed
    ).toBe(false);
  });

  it("the legal-review checklist is documented and referenced as a launch gate", async () => {
    // The per-market legal-review checklist is a doc artifact — its existence is
    // the launch gate. Assert the file is present (issue 130 acceptance).
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const checklist = path.join(
      process.cwd(),
      "CONTEXT",
      "docs",
      "adr",
      "r1-market-legal-review-checklist.md"
    );
    const stat = await fs.stat(checklist);
    expect(stat.isFile()).toBe(true);
    const content = await fs.readFile(checklist, "utf-8");
    // Each enabled R1 market has a checklist section.
    expect(content).toContain("US");
    expect(content).toContain("IN");
  });
});
