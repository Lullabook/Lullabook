import type { Tier } from "@/domain/types";
import type { StoryCapUsage, CreditBalance } from "@/services/story-cap";

/**
 * Paywall UI config + tier badges + credit/upgrade surfaces (issue 99 / ADR-0023).
 *
 * The customer-facing monetization surfaces that present the model from issues
 * 91–94. **The server 403 (issue 91) remains the boundary** — UI gating is the
 * prompt, not the gate.
 */

export interface PaywallTier {
  id: Tier;
  label: string;
  monthlyPrice: number;
  annualPrice: number;
  storyCap: number;
  memberCap: number;
  canNarrate: boolean;
  canVideo: boolean;
  canCustomStyle: boolean;
  isRecommended?: boolean;
  valueProp: string;
}

export const PAYWALL_TIERS: PaywallTier[] = [
  {
    id: "basic",
    label: "Basic",
    monthlyPrice: 8,
    annualPrice: 80,
    storyCap: 4,
    memberCap: 2,
    canNarrate: false,
    canVideo: false,
    canCustomStyle: false,
    valueProp: "Illustrated stories starring your family — the essentials.",
  },
  {
    id: "normal",
    label: "Normal",
    monthlyPrice: 15,
    annualPrice: 150,
    storyCap: 8,
    memberCap: 4,
    canNarrate: true,
    canVideo: false,
    canCustomStyle: false,
    isRecommended: true,
    valueProp: "Narration + voice clips bring stories to life. The sweet spot.",
  },
  {
    id: "plus",
    label: "Plus",
    monthlyPrice: 25,
    annualPrice: 250,
    storyCap: 20,
    memberCap: Infinity,
    canNarrate: true,
    canVideo: true,
    canCustomStyle: true,
    valueProp: "Video pages, custom art styles, and unlimited family members.",
  },
];

/** Annual billing is the default option (ADR-0023). */
export function isAnnualDefault(): boolean {
  return true;
}

export interface TierBadge {
  label: string;
  color: string;
}

const TIER_BADGES: Record<Tier, TierBadge> = {
  basic: { label: "Basic", color: "#8B7AB8" },
  normal: { label: "Normal", color: "#9B6DC4" },
  plus: { label: "Plus", color: "#F5A623" },
};

export function getTierBadge(tier: Tier): TierBadge {
  return TIER_BADGES[tier];
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
