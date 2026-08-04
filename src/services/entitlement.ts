import type { DataStore } from "@/db/store";
import type { Plan, Tier } from "@/domain/types";
import type { SubscriptionService } from "@/services/subscription";
import { isR1MultiFamilyEnabled } from "@/lib/r1-config";
import { isR1OnePlan } from "@/lib/paywall-config";
import { LEGACY_TIER_COMPATIBILITY, R1_PLAN_DEFINITION } from "@/domain/plan";

/**
 * Tier & entitlement model (ADR-0025 supersedes ADR-0023).
 *
 * Two plans on a collaboration axis: **Just Us** (one creator, view-only
 * invitees, no voice/video) and **Our Whole Family** (everyone creates, voice +
 * video + custom style). Each plan maps to a monthly Story cap, a Family-member
 * (likeness) cap, a **member-login cap** (distinct from the likeness cap — the
 * collaboration lever), and capability flags. Every gated use-case consults a
 * single authorization check here; an unentitled call rejects with an
 * {@link EntitlementError} (403). The client UI gate is UX only — this is the
 * boundary.
 *
 * The plan is derived from the subscription's `tier` field (legacy Basic/Normal/
 * Plus maps forward: Basic/Normal → Just Us, Plus → Our Whole Family). Until a
 * plan field is set, an active subscription defaults to **Just Us**. The trial
 * (card-on-file = VPC) activates the full **Our Whole Family** experience.
 * `DEV_FORCE_SUBSCRIPTION` stays a dev-only override (never ships).
 */

/** A capability gate that maps to a tier flag. */
export type Capability = "narrate" | "video" | "customStyle";

/** The entitlement bundle for a tier (legacy ADR-0023). */
export interface Entitlement {
  tier: Tier;
  /** Monthly Story cap (margin guard). Issue 93 enforces the count. */
  storyCap: number;
  /** Family-member (likeness) cap; Plus is unlimited. */
  memberCap: number;
  canNarrate: boolean;
  canVideo: boolean;
  canCustomStyle: boolean;
}

/**
 * ADR-0025 — Two-plan entitlement bundle. Adds `memberLoginCap` (distinct from
 * the likeness `memberCap`) and the `plan` identifier.
 */
export interface PlanEntitlement extends Entitlement {
  plan: Plan;
  /** Per-plan limit on Member logins (Just Us = parent; Our Whole Family = whole family). */
  memberLoginCap: number;
}

/** Per-tier entitlement config (ADR-0023 — legacy, maps forward to plans). */
export const TIER_ENTITLEMENTS: Record<Tier, Entitlement> = {
  basic: {
    tier: "basic",
    storyCap: 4,
    memberCap: 2,
    canNarrate: false,
    canVideo: false,
    canCustomStyle: false,
  },
  normal: {
    tier: "normal",
    // Legacy compatibility only; R1 gates resolve PLAN_ENTITLEMENTS below.
    storyCap: R1_PLAN_DEFINITION.limits.storybooksPerMonth * 2,
    memberCap: R1_PLAN_DEFINITION.limits.personas + 1,
    canNarrate: true,
    canVideo: false,
    canCustomStyle: false,
  },
  plus: {
    tier: "plus",
    storyCap: 20,
    memberCap: Infinity,
    canNarrate: true,
    canVideo: true,
    canCustomStyle: true,
  },
};

/** ADR-0025 — Two-plan entitlement config. */
export const PLAN_ENTITLEMENTS: Record<Plan, PlanEntitlement> = {
  just_us: {
    plan: "just_us",
    tier: "normal", // legacy compat
    storyCap: R1_PLAN_DEFINITION.limits.storybooksPerMonth,
    memberCap: R1_PLAN_DEFINITION.limits.personas,
    memberLoginCap: R1_PLAN_DEFINITION.limits.memberLogins,
    ...R1_PLAN_DEFINITION.capabilities,
  },
  our_whole_family: {
    plan: "our_whole_family",
    tier: "plus", // legacy compat
    storyCap: 20,
    memberCap: Infinity,
    memberLoginCap: Infinity, // the whole family
    canNarrate: true,
    canVideo: true,
    canCustomStyle: true,
  },
};

/** Maps a legacy Tier to the new Plan (ADR-0025). */
export function tierToPlan(tier: Tier | undefined): Plan {
  return LEGACY_TIER_COMPATIBILITY[tier ?? "normal"];
}

/** The unentitled bundle (no active subscription). */
const NO_ENTITLEMENT: Entitlement = {
  tier: "basic" as Tier,
  storyCap: 0,
  memberCap: 0,
  canNarrate: false,
  canVideo: false,
  canCustomStyle: false,
};

const CAPABILITY_FLAG: Record<Capability, keyof Entitlement> = {
  narrate: "canNarrate",
  video: "canVideo",
  customStyle: "canCustomStyle",
};

const CAPABILITY_TIER: Record<Capability, Tier> = {
  narrate: "normal",
  video: "plus",
  customStyle: "plus",
};

/** 403 raised by an unentitled call. The HTTP layer maps this to status 403. */
export class EntitlementError extends Error {
  readonly status = 403;
  readonly code: string;
  constructor(message: string, code = "entitlement") {
    super(message);
    this.name = "EntitlementError";
    this.code = code;
  }
}

/** Internal tier including the unentitled sentinel. */
type ResolvedTier = Tier | "none";

export class EntitlementService {
  constructor(
    private readonly store: DataStore,
    private readonly subscriptions: SubscriptionService
  ) {}

  /** The Household's resolved plan (ADR-0025). */
  getPlan(familyId: string): Plan | "none" {
    const tier = this.getTier(familyId);
    if (tier === "none") return "none";
    // R1 has one sellable plan. Legacy Plus rows remain readable for R2
    // compatibility, but cannot unlock cut multi-family capabilities by
    // merely surviving a migration.
    return isR1OnePlan() ? "just_us" : tierToPlan(tier as Tier);
  }

  /** The two-plan entitlement bundle (ADR-0025). */
  getPlanEntitlement(familyId: string): PlanEntitlement {
    const plan = this.getPlan(familyId);
    if (plan === "none") {
      return {
        ...NO_ENTITLEMENT,
        plan: "just_us" as Plan,
        memberLoginCap: 0,
      };
    }
    return PLAN_ENTITLEMENTS[plan];
  }

  /**
   * ADR-0024 / ADR-0025 — Gate: the Household must have a free member-login
   * slot. The login cap is **distinct from** the likeness cap (which guards
   * LoRA-training cost). Just Us = parent (+ co-parent view-only); Our Whole
   * Family = the whole family.
   */
  requireMemberLoginSlot(familyId: string): void {
    const plan = this.getPlan(familyId);
    if (plan === "none") {
      throw new EntitlementError("An active subscription is required", "not_entitled");
    }
    const ent = this.getPlanEntitlement(familyId);
    if (ent.memberLoginCap === Infinity) return;
    const members = [...this.store.members.values()].filter((m) => m.familyId === familyId);
    if (members.length >= ent.memberLoginCap) {
      throw new EntitlementError(
        `Member login cap reached (${ent.memberLoginCap} for ${ent.plan})`,
        "login_cap_reached"
      );
    }
  }

  /** R1 server-side actor authorization: only the creating Guardian may create. */
  requireCanCreate(
    familyId: string,
    actorMemberId: string,
    _intent: "story" | "adult-persona" | "baby-persona" = "story",
  ): void {
    const plan = this.getPlan(familyId);
    if (plan === "none") {
      throw new EntitlementError("An active subscription is required", "not_entitled");
    }
    const member = this.store.members.get(actorMemberId);
    if (!member) throw new EntitlementError("Member not found", "member_not_found");

    if ((plan === "just_us" || !isR1MultiFamilyEnabled()) && member.role !== "guardian") {
      throw new EntitlementError(
        "Only the Guardian can create Stories or Personas in this release",
        "create_not_allowed"
      );
    }
  }

  /** The Household's resolved tier (incl. `none` when unentitled). */
  getTier(familyId: string): ResolvedTier {
    if (!this.subscriptions.isActive(familyId)) return "none";
    const sub = this.store.getSubscription(familyId);
    return sub?.tier ?? "normal";
  }

  /** Canonical R1 projection used by paid server surfaces. */
  getEntitlement(familyId: string): Entitlement {
    return this.getPlanEntitlement(familyId);
  }

  /** Compatibility name for callers that explicitly need the R1 projection. */
  getR1Entitlement(familyId: string): PlanEntitlement {
    return this.getPlanEntitlement(familyId);
  }

  /** Gate: the Household must have an active (paid or trial) subscription. */
  requireEntitled(familyId: string): void {
    if (this.getTier(familyId) === "none") {
      throw new EntitlementError(
        "An active subscription is required",
        "not_entitled"
      );
    }
  }

  /** Gate: the Household's legacy tier must grant the capability, else 403. */
  requireCapability(familyId: string, capability: Capability): void {
    const plan = this.getPlan(familyId);
    const tier = this.getTier(familyId);
    const ent = plan === "none"
      ? NO_ENTITLEMENT
      : isR1OnePlan()
        ? this.getPlanEntitlement(familyId)
        : TIER_ENTITLEMENTS[tier as Tier];
    if (!ent[CAPABILITY_FLAG[capability]]) {
      const required = CAPABILITY_TIER[capability];
      throw new EntitlementError(
        `${capability} requires the ${required} tier`,
        `requires_${required}`
      );
    }
  }

  /**
   * Gate: creating another family-member (adult likeness — each is a LoRA, the
   * biggest cost) must stay within the tier's member cap, else 403. Counts the
   * family's existing adult personas (RLS-checked via the actor).
   *
   * A no-op for unentitled families (`tier === "none"`) — the subscription/VPC
   * gate (issue 92) blocks that path separately; the member cap only constrains
   * *entitled* households.
   */
  /**
   * R1 shared likeness allowance. Babies and Adults consume the same Persona
   * slots, and the check runs before photo persistence or provider training.
   */
  requirePersonaSlot(familyId: string, actorMemberId: string): void {
    const tier = this.getTier(familyId);
    if (tier === "none") return;
    const ent = this.getPlanEntitlement(familyId);
    if (ent.memberCap === Infinity) return;
    const personas = this.store.getPersonasByFamily(familyId, actorMemberId);
    if (personas.length >= ent.memberCap) {
      throw new EntitlementError(
        `Persona cap reached (${ent.memberCap} Personas for the ${ent.plan} plan)`,
        "persona_cap_reached"
      );
    }
  }

  /** Backward-compatible name for callers that used the old adult-only gate. */
  requireMemberSlot(familyId: string, actorMemberId: string): void {
    this.requirePersonaSlot(familyId, actorMemberId);
  }
}