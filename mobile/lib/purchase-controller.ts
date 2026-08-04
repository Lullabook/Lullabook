/**
 * Issue 170 (ADR-0027) — PurchaseController seam: fake-first R1 entry.
 *
 * One mobile interface (`startTrial()`), two implementations:
 *   - FakePurchaseController (R1): calls the real, prod-guarded
 *     `POST /api/billing/start-trial`, then re-fetches server-authoritative
 *     entitlement (`GET /api/entitlement`). SEC-1: the entitlement the app
 *     acts on NEVER comes from the purchase response — only from the refetch.
 *   - RevenueCatPurchaseController: a stub until the EAS milestone; the later
 *     real swap calls `Purchases.purchasePackage()` and the server learns via
 *     the existing webhook — this seam's shape is unchanged by that swap.
 *
 * This module is intentionally dependency-free (constructor-injected deps,
 * no imports) so the root vitest suite can import and drive it directly.
 * Live wiring to `mobile/lib/api.ts` lives in `mobile/lib/purchases.ts`.
 */

export interface EntitlementSnapshot {
  plan: import("../../src/domain/plan").R1PlanContract;
  usage: {
    storybooks: {
      count: number;
      remaining: number;
      resetDate: string;
    };
  };
}

/** Wire shape of POST /api/billing/start-trial (see src/app/api/billing/start-trial/route.ts). */
export interface StartTrialWire {
  isActive: boolean;
  trialEndsAt: string | null;
  /** Ignored by the client; only the post-purchase entitlement refetch is trusted. */
  entitlement: unknown;
}

export type StartTrialResult =
  | {
      ok: true;
      isActive: boolean;
      trialEndsAt: string | null;
      /** SEC-1: always the refetched server entitlement, never the POST body's. */
      entitlement: EntitlementSnapshot;
    }
  | { ok: false; error: string };

export interface PurchaseController {
  readonly kind: "fake" | "revenuecat";
  startTrial(): Promise<StartTrialResult>;
  restorePurchases?(): Promise<StartTrialResult>;
}

export interface PurchaseControllerDeps {
  startTrialRequest(): Promise<StartTrialWire>;
  fetchEntitlement(): Promise<EntitlementSnapshot>;
}

/** Native-module boundary; the SDK is injected by an EAS native profile. */
export interface NativeRevenueCatClient {
  purchase(productId: string): Promise<void>;
  restorePurchases(): Promise<void>;
}

export const REVENUECAT_VERIFICATION_ATTEMPTS = 3;
export const REVENUECAT_VERIFICATION_DELAY_MS = 250;

export interface RevenueCatPurchaseControllerDeps extends PurchaseControllerDeps {
  nativePurchases: NativeRevenueCatClient;
  productId: string;
  /** Server response after the webhook has made entitlement authoritative. */
  fetchVerifiedPurchase(): Promise<StartTrialResult>;
}

export class FakePurchaseController implements PurchaseController {
  readonly kind = "fake" as const;

  constructor(private readonly deps: PurchaseControllerDeps) {}

  async startTrial(): Promise<StartTrialResult> {
    try {
      const wire = await this.deps.startTrialRequest();
      // SEC-1: the client never derives entitlement from the purchase
      // response optimistically — refetch the server-authoritative snapshot.
      // If the refetch fails we fail CLOSED (FAIL-2): no entitlement change.
      const entitlement = await this.deps.fetchEntitlement();
      return {
        ok: true,
        isActive: wire.isActive,
        trialEndsAt: wire.trialEndsAt,
        entitlement,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Purchase failed — please try again",
      };
    }
  }
}

/**
 * Native RevenueCat seam. The SDK transaction is never enough to unlock: the
 * injected server read must report verified entitlement after the webhook.
 * With no native client (Expo Go), retain the old structured failure.
 */
export class RevenueCatPurchaseController implements PurchaseController {
  readonly kind = "revenuecat" as const;

  constructor(private readonly deps?: RevenueCatPurchaseControllerDeps) {}

  async startTrial(): Promise<StartTrialResult> {
    if (!this.deps) return this.unavailable();
    try {
      await this.deps.nativePurchases.purchase(this.deps.productId);
      return await this.verifiedResult();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Purchase failed — please try again" };
    }
  }

  async restorePurchases(): Promise<StartTrialResult> {
    if (!this.deps) return this.unavailable();
    try {
      await this.deps.nativePurchases.restorePurchases();
      return await this.verifiedResult();
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Restore failed — please try again" };
    }
  }

  private async verifiedResult(): Promise<StartTrialResult> {
    const deps = this.deps!;
    let result: StartTrialResult = { ok: false, error: "Purchase is pending server verification" };
    for (let attempt = 0; attempt < REVENUECAT_VERIFICATION_ATTEMPTS; attempt += 1) {
      result = await deps.fetchVerifiedPurchase();
      if (result.ok && result.isActive) return result;
      if (attempt < REVENUECAT_VERIFICATION_ATTEMPTS - 1) {
        await new Promise((resolve) => setTimeout(resolve, REVENUECAT_VERIFICATION_DELAY_MS));
      }
    }
    return {
      ok: false,
      error: result.ok
        ? "Purchase is pending server verification — no paid action was unlocked"
        : result.error || "Purchase is pending server verification — no paid action was unlocked",
    };
  }

  private unavailable(): StartTrialResult {
    return {
      ok: false,
      error:
        "Real purchases (react-native-purchases) are not available in Expo Go — deferred to the EAS milestone (ADR-0027)",
    };
  }
}

/**
 * The single factory the app calls (via mobile/lib/purchases.ts). Selection
 * is a build-time flag, not a runtime toggle a user can flip.
 */
export function createPurchaseController(
  deps: PurchaseControllerDeps,
  realPurchasesEnabled: boolean,
  nativeDeps?: RevenueCatPurchaseControllerDeps
): PurchaseController {
  return realPurchasesEnabled
    ? new RevenueCatPurchaseController(nativeDeps)
    : new FakePurchaseController(deps);
}
