import { describe, expect, it } from "vitest";
import { DemoStoryService, FirstOpenService } from "@/services/first-open";

/**
 * Issue 131 — Onboarding aha: Demo Story → sign-up → trial → consent → photos.
 *
 * The pre-baked baby-free Demo Story (test 98) and demo-first ordering exist;
 * this pins the R1 gaps: (a) the flow includes the consent + photos steps in
 * the right order; (b) the Demo Story is pre-baked (no generation) so it loads
 * < 1s; (c) persona creation is gated on consent + entitlement (server-enforced
 * — already covered by 92/127; here we assert the flow surfaces consent before
 * photos).
 */

describe("131 — R1 onboarding aha flow", () => {
  it("the Demo Story is pre-baked — getDemoStory is synchronous (no generation, < 1s)", () => {
    const svc = new DemoStoryService();
    // A synchronous return with no async/await means no model call — the demo
    // is a static asset, so it loads in < 1s before any sign-up/paywall.
    const start = Date.now();
    const demo = svc.getDemoStory();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(demo.isBabyFree).toBe(true);
    expect(demo.requiresSignup).toBe(false);
    expect(demo.requiresCard).toBe(false);
    expect(demo.pages.length).toBeGreaterThan(0);
  });

  it("the flow is demo → signup → paywall → consent → photos (in order)", () => {
    const svc = new FirstOpenService();
    const flow = svc.getFlow();
    const types = flow.steps.map((s) => s.type);
    expect(types).toEqual(["demo", "signup", "paywall", "consent", "photos"]);

    // Demo first, paywall before consent, photos last.
    const demoIdx = types.indexOf("demo");
    const paywallIdx = types.indexOf("paywall");
    const consentIdx = types.indexOf("consent");
    const photosIdx = types.indexOf("photos");
    expect(demoIdx).toBe(0);
    expect(paywallIdx).toBeLessThan(consentIdx);
    expect(consentIdx).toBeLessThan(photosIdx);
    expect(photosIdx).toBe(types.length - 1);
  });

  it("consent comes before photo upload — the gate ordering (server-enforced)", () => {
    // The flow surfaces consent BEFORE photos so a parent never uploads baby
    // photos without a consent receipt on file. The server enforces this
    // regardless (Baby Persona creation throws without consent — 92/127).
    const svc = new FirstOpenService();
    const flow = svc.getFlow();
    const consentIdx = flow.steps.findIndex((s) => s.type === "consent");
    const photosIdx = flow.steps.findIndex((s) => s.type === "photos");
    expect(consentIdx).toBeGreaterThanOrEqual(0);
    expect(photosIdx).toBeGreaterThan(consentIdx);
  });
});
