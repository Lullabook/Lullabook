import type { SubscriptionService } from "@/services/subscription";

export interface RevenueCatWebhookEvent {
  type: string;
  app_user_id: string;
  entitlement_ids?: string[];
}

export interface RevenueCatSignatureVerifier {
  verify(payload: string, signature: string | null): boolean;
}

export class RevenueCatWebhookHandler {
  constructor(
    private readonly subscriptions: SubscriptionService,
    private readonly verifier: RevenueCatSignatureVerifier
  ) {}

  handle(payload: string, signature: string | null): { ok: boolean; error?: string } {
    if (!this.verifier.verify(payload, signature)) {
      return { ok: false, error: "Invalid signature" };
    }
    const event = JSON.parse(payload) as RevenueCatWebhookEvent;
    const familyId = event.app_user_id;
    if (!familyId) return { ok: false, error: "Missing app_user_id" };

    if (event.type === "INITIAL_PURCHASE" || event.type === "RENEWAL") {
      this.subscriptions.handleRevenueCatActivated(familyId, `rc_${familyId}`);
      return { ok: true };
    }
    if (event.type === "CANCELLATION" || event.type === "EXPIRATION") {
      this.subscriptions.cancel(familyId);
      return { ok: true };
    }
    return { ok: true };
  }
}
