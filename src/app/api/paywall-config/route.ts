import { NextResponse } from "next/server";
import { getR1VisiblePlans } from "@/lib/paywall-config";
import { R1_PLAN_DEFINITION } from "@/domain/plan";

/**
 * Issue 129 — Server-side paywall config for the native app. Returns the
 * R1-visible plans (one plan when `R1_ONE_PLAN=true`; two when off). Mobile
 * billing renders from this so the one-plan collapse is server-authoritative,
 * not duplicated in the client.
 */
export async function GET(): Promise<NextResponse> {
  const visible = getR1VisiblePlans();
  // The R1 mobile wire uses the exact same nested plan contract as entitlement.
  // Keep the explicitly enabled R2 compatibility path on its legacy shape.
  if (visible.length === 1 && visible[0]?.id === R1_PLAN_DEFINITION.plan) {
    return NextResponse.json({ plans: [R1_PLAN_DEFINITION] });
  }
  return NextResponse.json({ plans: visible });
}
