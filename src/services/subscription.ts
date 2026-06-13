import { v4 as uuid } from "uuid";
import type { StripeAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { ConsentReceipt } from "@/domain/types";
import { ConsentEngine } from "@/services/consent-engine";

export class SubscriptionService {
  private readonly consentEngine = new ConsentEngine();

  constructor(
    private readonly store: DataStore,
    private readonly stripe: StripeAdapter
  ) {}

  async startCheckout(familyId: string) {
    return this.stripe.createCheckoutSession(familyId);
  }

  handleCheckoutCompleted(familyId: string, stripeCustomerId: string, stripeSubscriptionId: string) {
    this.store.saveSubscription({
      familyId,
      status: "active",
      stripeCustomerId,
      stripeSubscriptionId,
      updatedAt: new Date(),
    });
  }

  handleRevenueCatActivated(familyId: string, revenueCatSubscriptionId: string) {
    const existing = this.store.getSubscription(familyId);
    this.store.saveSubscription({
      familyId,
      status: "active",
      stripeCustomerId: existing?.stripeCustomerId ?? null,
      stripeSubscriptionId: existing?.stripeSubscriptionId ?? revenueCatSubscriptionId,
      updatedAt: new Date(),
    });
  }

  cancel(familyId: string) {
    const sub = this.store.getSubscription(familyId);
    if (!sub?.stripeSubscriptionId) throw new Error("No subscription");
    this.store.saveSubscription({
      ...sub,
      status: "canceled",
      updatedAt: new Date(),
    });
    const purgeAt = new Date();
    purgeAt.setDate(purgeAt.getDate() + 30);
    this.store.purgeScheduled.set(familyId, { familyId, purgeAt });
  }

  isActive(familyId: string): boolean {
    return this.store.getSubscription(familyId)?.status === "active";
  }

  recordConsent(
    familyId: string,
    memberId: string,
    jurisdiction: string
  ): ConsentReceipt {
    const config = ConsentEngine.getJurisdiction(jurisdiction);
    if (!config) throw new Error("Unknown jurisdiction");
    const receipt: ConsentReceipt = {
      id: uuid(),
      familyId,
      memberId,
      jurisdiction,
      noticeVersion: config.noticeVersion,
      consentedAt: new Date(),
    };
    this.store.saveConsentReceipt(receipt);
    return receipt;
  }

  canCreateBabyPersona(memberId: string): { allowed: boolean; reason?: string } {
    const member = this.store.members.get(memberId);
    if (!member) return { allowed: false, reason: "Member not found" };
    const result = this.consentEngine.check({
      jurisdiction: member.jurisdiction,
      actorRole: member.role,
      action: "create_baby_persona",
      hasActiveSubscription: this.isActive(member.familyId),
      hasConsentReceipt: !!this.store.getConsentReceiptForFamily(member.familyId),
    });
    return { allowed: result.allowed, reason: result.reason };
  }
}
