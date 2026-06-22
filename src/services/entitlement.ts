import type { DataStore } from "@/db/store";
import type { Tier } from "@/domain/types";
import type { SubscriptionService } from "@/services/subscription";

/**
 * Tier & entitlement model (ADR-0023 / issue 91).
 *
 * The server-side source of truth for what a Household may do: the paid tier
 * (Basic / Normal / Plus) maps to a monthly Story cap, a Family-member cap,
 * and capability flags (narration / video / custom style). Every gated use-case
 * consults a single authorization check here; an unentitled call rejects with an
 * {@link EntitlementError} (403). The client UI gate is UX only — this is the
 * boundary.
 *
 * Tier is derived from the validated subscription (RevenueCat entitlement in
 * issue 92). Until then, an active subscription with no `tier` field defaults
 * to **Normal** (the trial / anchor tier). `DEV_FORCE_SUBSCRIPTION` stays a
 * dev-only override (never ships): a forced-active dev env reads as Normal, a
 * forced-inactive dev env reads as unentitled.
 *
 * Enforcement is idempotent: the checks are pure reads over family-scoped state,
 * so a replayed/duplicate request re-evaluates to the same 403 and cannot bypass
 * a gate or consume a slot. (The monthly Story-cap *counter* is issue 93; the
 * credit *ledger* is issue 94 — this service exposes the cap/flag config they
 * meter against.)
 */

/** A capability gate that maps to a tier flag. */
export type Capability = "narrate" | "video" | "customStyle";

/** The entitlement bundle for a tier. */
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

/** Per-tier entitlement config (ADR-0023). */
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
    storyCap: 8,
    memberCap: 4,
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

  /** The Household's resolved tier (incl. `none` when unentitled). */
  getTier(familyId: string): ResolvedTier {
    if (!this.subscriptions.isActive(familyId)) return "none";
    const sub = this.store.getSubscription(familyId);
    return sub?.tier ?? "normal";
  }

  /** The entitlement bundle for the Household's tier. */
  getEntitlement(familyId: string): Entitlement {
    const tier = this.getTier(familyId);
    if (tier === "none") return { ...NO_ENTITLEMENT };
    return TIER_ENTITLEMENTS[tier];
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

  /** Gate: the Household's tier must grant the capability, else 403. */
  requireCapability(familyId: string, capability: Capability): void {
    const ent = this.getEntitlement(familyId);
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
  requireMemberSlot(familyId: string, actorMemberId: string): void {
    const tier = this.getTier(familyId);
    if (tier === "none") return;
    const ent = this.getEntitlement(familyId);
    if (ent.memberCap === Infinity) return;
    const adults = this.store
      .getPersonasByFamily(familyId, actorMemberId)
      .filter((p) => p.kind === "adult").length;
    if (adults >= ent.memberCap) {
      throw new EntitlementError(
        `Family member cap reached (${ent.memberCap} for the ${ent.tier} tier)`,
        "member_cap_reached"
      );
    }
  }
}