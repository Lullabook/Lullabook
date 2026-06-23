import { NextResponse } from "next/server";
import { getR1VisiblePlans, isAnnualDefault } from "@/lib/paywall-config";

/**
 * Issue 129 — Server-side paywall config for the native app. Returns the
 * R1-visible plans (one plan when `R1_ONE_PLAN=true`; two when off). Mobile
 * billing renders from this so the one-plan collapse is server-authoritative,
 * not duplicated in the client.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    plans: getR1VisiblePlans(),
    annualDefault: isAnnualDefault(),
  });
}
