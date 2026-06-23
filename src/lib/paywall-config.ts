import type { Plan, Tier } from "@/domain/types";
import type { StoryCapUsage } from "@/services/story-cap";
import type { CreditBalance } from "@/services/credit-ledger";

/**
 * Paywall UI config + plan badges + credit/upgrade surfaces (ADR-0025).
 *
 * Two plans on a collaboration axis: Just Us / Our Whole Family. The server 403
 * (EntitlementService) remains the boundary — UI gating is the prompt, not the
 * gate.
 */

export interface PaywallPlan {
  id: Plan;
  label: string;
  monthlyPrice: number;
  annualPrice: number;
  storyCap: number;
  memberCap: number;
  memberLoginCap: number;
  canNarrate: boolean;
  canVideo: boolean;
  canCustomStyle: boolean;
  isRecommended?: boolean;
  valueProp: string;
}

export const PAYWALL_PLANS: PaywallPlan[] = [
  {
    id: "just_us",
    label: "Just Us",
    monthlyPrice: 9.99,
    annualPrice: 79.99,
    storyCap: 8,
    memberCap: 3,
    memberLoginCap: 2,
    canNarrate: false,
    canVideo: false,
    canCustomStyle: false,
    valueProp: "One creating parent, illustrated stories starring your family.",
  },
  {
    id: "our_whole_family",
    label: "Our Whole Family",
    monthlyPrice: 24.99,
    annualPrice: 199.99,
    storyCap: 20,
    memberCap: Infinity,
    memberLoginCap: Infinity,
    canNarrate: true,
    canVideo: true,
    canCustomStyle: true,
    isRecommended: true,
    valueProp: "Everyone creates, voice messages, video pages, and custom art styles.",
  },
];

/** Legacy compat: PAYWALL_TIERS maps to the new plans. */
export const PAYWALL_TIERS = PAYWALL_PLANS;

/**
 * Issue 129 / ADR-0025 amendment — R1 ships ONE plan (Just Us + 7-day trial);
 * "Our Whole Family" is hidden until its features (voice/video/invited members)
 * exist in R2. The full two-plan model stays in code (PAYWALL_PLANS); this flag
 * filters the *visible/sellable* set for R1. Inert off — R2 shows both again.
 */
export function getR1VisiblePlans(): PaywallPlan[] {
  return process.env.R1_ONE_PLAN === "true"
    ? PAYWALL_PLANS.filter((p) => p.id === "just_us")
    : PAYWALL_PLANS;
}

/** Whether R1 is hiding the premium plan (amends ADR-0025). */
export function isR1OnePlan(): boolean {
  return process.env.R1_ONE_PLAN === "true";
}

/** Annual billing is the default option (ADR-0025). */
export function isAnnualDefault(): boolean {
  return true;
}

export interface PlanBadge {
  label: string;
  color: string;
}

const PLAN_BADGES: Record<Plan, PlanBadge> = {
  just_us: { label: "Just Us", color: "#8B7AB8" },
  our_whole_family: { label: "Our Whole Family", color: "#F5A623" },
};

export function getPlanBadge(plan: Plan): PlanBadge {
  return PLAN_BADGES[plan];
}

/** Legacy compat: getTierBadge maps through to plan badges. */
export function getTierBadge(tier: Tier): PlanBadge {
  return PLAN_BADGES[tier === "plus" ? "our_whole_family" : "just_us"];
}

export interface CapUsageState {
  label: string;
  resetDate: string;
  isExhausted: boolean;
  upgradeCta: string | null;
}

export function getCapUsageState(usage: StoryCapUsage): CapUsageState {
  return {
    label: `${usage.count}/${usage.cap} this month`,
    resetDate: usage.resetDate,
    isExhausted: usage.remaining === 0,
    upgradeCta: usage.remaining === 0 ? "Upgrade for more stories" : null,
  };
}

export interface CreditUsageState {
  label: string;
  resetDate: string;
  isExhausted: boolean;
  buyCta: string | null;
}

export function getCreditUsageState(balance: CreditBalance): CreditUsageState {
  const totalAvailable = balance.videoIncluded + balance.customStyleIncluded + balance.purchased;
  return {
    label: `${totalAvailable} credit${totalAvailable === 1 ? "" : "s"} available`,
    resetDate: balance.resetDate,
    isExhausted: totalAvailable === 0,
    buyCta: totalAvailable === 0 ? "Buy more credits" : null,
  };
}
