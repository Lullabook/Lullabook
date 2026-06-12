import { describe, expect, it } from "vitest";
import { ConsentEngine } from "@/services/consent-engine";
import { JurisdictionService } from "@/services/jurisdiction";

describe("14 — multi-jurisdiction expansion", () => {
  it("reads child-age threshold from config, never hardcoded", () => {
    const svc = new JurisdictionService();
    expect(svc.childAgeThreshold("US")).toBe(13);
    expect(svc.childAgeThreshold("IN")).toBe(18);
    expect(svc.childAgeThreshold("KR")).toBe(14);
  });

  it("routes storage keys to configured residency regions", () => {
    const svc = new JurisdictionService();
    const key = svc.storageKeyForRegion(svc.residencyRegion("IN"), "family-1", "photos/1.jpg");
    expect(key).toBe("ap-south-1/family-1/photos/1.jpg");
  });

  it("gates signups with per-country feature flags", () => {
    const svc = new JurisdictionService();
    const engine = new ConsentEngine();

    expect(svc.isMarketEnabled("US")).toBe(true);
    expect(svc.isMarketEnabled("KR")).toBe(false);

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

  it("ConsentEngine table tests cover US and India consent methods", () => {
    const _engine = new ConsentEngine();
    const us = ConsentEngine.getJurisdiction("US")!;
    const india = ConsentEngine.getJurisdiction("IN")!;

    expect(us.noticeVersion).toBe("us-coppa-v1");
    expect(india.noticeVersion).toBe("in-dpdp-v1");
    expect(us.consentMethod).toBe("payment_vpc");
    expect(india.consentMethod).toBe("payment_vpc");
  });
});
