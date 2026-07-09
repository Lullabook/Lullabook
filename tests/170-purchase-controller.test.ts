/**
 * Issue 170 (ADR-0027) — PurchaseController seam: FakePurchaseController +
 * RevenueCat stub + single selection factory.
 *
 * The seam module is dependency-free by design, so this suite imports and
 * drives it directly (behavioral), and only falls back to source/manifest
 * inspection for the mobile-only wiring file and the "no react-native-
 * purchases dep in R1" guarantee.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FakePurchaseController,
  RevenueCatPurchaseController,
  createPurchaseController,
  type EntitlementSnapshot,
  type PurchaseControllerDeps,
  type StartTrialWire,
} from "../mobile/lib/purchase-controller";

const optimisticEntitlement: EntitlementSnapshot = {
  tier: "our_whole_family", // deliberately wrong — must never be trusted
  capabilities: { canNarrate: true, canVideo: true, canCustomStyle: true },
};

const serverEntitlement: EntitlementSnapshot = {
  tier: "just_us",
  capabilities: { canNarrate: true, canVideo: false, canCustomStyle: false },
};

const wire: StartTrialWire = {
  isActive: true,
  trialEndsAt: "2026-07-13T00:00:00.000Z",
  entitlement: optimisticEntitlement,
};

function deps(overrides: Partial<PurchaseControllerDeps> = {}): PurchaseControllerDeps {
  return {
    startTrialRequest: async () => wire,
    fetchEntitlement: async () => serverEntitlement,
    ...overrides,
  };
}

describe("FakePurchaseController (issue 170)", () => {
  it("SEC-1: entitlement comes from the server refetch, never the purchase response", async () => {
    const calls: string[] = [];
    const controller = new FakePurchaseController(
      deps({
        startTrialRequest: async () => {
          calls.push("post");
          return wire;
        },
        fetchEntitlement: async () => {
          calls.push("refetch");
          return serverEntitlement;
        },
      })
    );
    const result = await controller.startTrial();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.entitlement).toEqual(serverEntitlement);
    expect(result.entitlement.tier).not.toBe(optimisticEntitlement.tier);
    expect(calls).toEqual(["post", "refetch"]); // refetch happens after the POST
    expect(result.isActive).toBe(true);
    expect(result.trialEndsAt).toBe(wire.trialEndsAt);
  });

  it("FAIL-2: a failed purchase returns a structured error and changes nothing", async () => {
    let refetched = false;
    const controller = new FakePurchaseController(
      deps({
        startTrialRequest: async () => {
          throw new Error("Trial activation is not available in production");
        },
        fetchEntitlement: async () => {
          refetched = true;
          return serverEntitlement;
        },
      })
    );
    const result = await controller.startTrial();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/not available in production/);
    expect("entitlement" in result).toBe(false); // no optimistic leftovers
    expect(refetched).toBe(false); // fail closed before any entitlement read
  });

  it("fails CLOSED when the POST succeeds but the entitlement refetch fails", async () => {
    const controller = new FakePurchaseController(
      deps({
        fetchEntitlement: async () => {
          throw new Error("network dropped");
        },
      })
    );
    const result = await controller.startTrial();
    expect(result.ok).toBe(false); // never ok:true with an unverified entitlement
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/network dropped/);
  });

  it("wraps non-Error throws into a structured failure (never rejects into UI)", async () => {
    const controller = new FakePurchaseController(
      deps({
        startTrialRequest: async () => {
          // eslint-disable-next-line no-throw-literal
          throw "boom";
        },
      })
    );
    const result = await controller.startTrial();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/try again/i);
  });
});

describe("RevenueCat stub + factory (issue 170)", () => {
  it("factory returns the fake by default (R1) and the stub only behind the flag", () => {
    expect(createPurchaseController(deps(), false)).toBeInstanceOf(FakePurchaseController);
    expect(createPurchaseController(deps(), true)).toBeInstanceOf(RevenueCatPurchaseController);
    expect(createPurchaseController(deps(), false).kind).toBe("fake");
    expect(createPurchaseController(deps(), true).kind).toBe("revenuecat");
  });

  it("the stub never optimistically succeeds — structured EAS-milestone error", async () => {
    const result = await new RevenueCatPurchaseController().startTrial();
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error).toMatch(/Expo Go/);
    expect(result.error).toMatch(/EAS milestone/);
  });
});

describe("R1 packaging + wiring guarantees (issue 170)", () => {
  const mobileDir = path.join(__dirname, "..", "mobile");

  it("react-native-purchases is NOT a dependency in R1 (deferred to EAS)", () => {
    const pkg = JSON.parse(readFileSync(path.join(mobileDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["react-native-purchases"]).toBeUndefined();
    expect(pkg.devDependencies?.["react-native-purchases"]).toBeUndefined();
  });

  it("purchases.ts binds the seam to the real api functions behind the build-time flag", () => {
    const src = readFileSync(path.join(mobileDir, "lib", "purchases.ts"), "utf8");
    expect(src).toMatch(/startTrialRequest/);
    expect(src).toMatch(/fetchEntitlementSnapshot/);
    expect(src).toMatch(/createPurchaseController/);
    expect(src).toMatch(/EXPO_PUBLIC_REAL_PURCHASES/);
  });

  it("api.ts wires the seam to the real prod-guarded routes", () => {
    const src = readFileSync(path.join(mobileDir, "lib", "api.ts"), "utf8");
    expect(src).toMatch(/\/api\/billing\/start-trial/);
    expect(src).toMatch(/"\/api\/entitlement"/);
  });
});
