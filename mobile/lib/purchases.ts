/**
 * Issue 170 (ADR-0027) — live wiring for the PurchaseController seam.
 * The pure seam lives in ./purchase-controller (dependency-free, root-tested);
 * this file is the only place the app binds it to the real api client.
 */
import { fetchEntitlementSnapshot, startTrialRequest } from "@/lib/api";
import {
  createPurchaseController,
  type PurchaseController,
} from "@/lib/purchase-controller";

let controller: PurchaseController | null = null;

/** The single factory call sites use (paywall CTA — issue 171). */
export function getPurchaseController(): PurchaseController {
  if (!controller) {
    controller = createPurchaseController(
      { startTrialRequest, fetchEntitlement: fetchEntitlementSnapshot },
      // Build-time flag; flips to the RevenueCat implementation at the EAS
      // milestone. Absent/anything-else ⇒ FakePurchaseController (R1).
      process.env.EXPO_PUBLIC_REAL_PURCHASES === "true"
    );
  }
  return controller;
}
