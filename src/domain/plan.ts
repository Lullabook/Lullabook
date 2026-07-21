// Relative import: this module is also type-checked from mobile/ where the
// "@/" alias resolves to the mobile app, not src/.
import type { Plan, Tier } from "./types";

/**
 * Server-authoritative R1 Just Us economics. Every R1 surface that describes or
 * enforces the paid plan must derive from this definition rather than copying
 * prices or caps into a route, web component, or native fallback.
 */
export const R1_MARGIN_THRESHOLDS = {
  /** Initial direct-cost reserve while production cohorts stabilize. */
  directCostReserveMinPercent: 15,
  directCostReserveMaxPercent: 25,
  greenVarianceMaxPercent: 5,
  amberVarianceMaxPercent: 10,
  fullCapP95MarginFloorPercent: 70,
  typicalPostPlatformMarginMinPercent: 75,
  typicalPostPlatformMarginMaxPercent: 80,
} as const;

export type R1CostThreshold = "green" | "amber" | "red";

export const R1_PLAN_DEFINITION = {
  plan: "just_us" as const,
  label: "Just Us",
  pricing: {
    monthly: 14.99,
    annual: 119.99,
    annualDefault: true,
  },
  limits: {
    storybooksPerMonth: 4,
    personas: 3,
    starringPersonas: 3,
    memberLogins: 1,
  },
  capabilities: {
    canNarrate: false,
    canVideo: false,
    canCustomStyle: false,
  },
  valueProp: "One Guardian creates illustrated Storybooks starring their Family.",
} as const;

/**
 * Compatibility decision for rows written before ADR-0028. Legacy subscriptions
 * remain readable; Basic and Normal resolve to R1 Just Us, while Plus remains
 * addressable as the deferred Our Whole Family plan until an explicit billing
 * migration retires that product identity.
 */
export const LEGACY_TIER_COMPATIBILITY: Record<Tier, Plan> = {
  basic: "just_us",
  normal: "just_us",
  plus: "our_whole_family",
};

export function legacyTierToPlan(tier: Tier | undefined): Plan {
  return LEGACY_TIER_COMPATIBILITY[tier ?? "normal"];
}
