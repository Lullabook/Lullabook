import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { PushSubscription } from "@/domain/types";
import type { PushSubscriptionStore } from "@/adapters/notifications";

export class InMemoryPushSubscriptionStore implements PushSubscriptionStore {
  constructor(private readonly store: DataStore) {}

  async registerToken(memberId: string, expoPushToken: string): Promise<PushSubscription> {
    for (const [id, sub] of this.store.pushSubscriptions) {
      if (sub.memberId === memberId && sub.expoPushToken === expoPushToken) {
        return sub;
      }
    }
    for (const [id, sub] of this.store.pushSubscriptions) {
      if (sub.expoPushToken === expoPushToken) {
        this.store.pushSubscriptions.delete(id);
      }
    }
    const created: PushSubscription = {
      id: uuid(),
      memberId,
      expoPushToken,
      createdAt: new Date(),
    };
    this.store.pushSubscriptions.set(created.id, created);
    return created;
  }

  async getSubscriptionsForMember(
    memberId: string
  ): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } }[]> {
    return [...this.store.pushSubscriptions.values()]
      .filter((s) => s.memberId === memberId)
      .map((s) => ({
        endpoint: `expo:${s.expoPushToken}`,
        keys: { p256dh: "expo", auth: "expo" },
      }));
  }

  async getExpoTokensForMember(memberId: string): Promise<string[]> {
    return [...this.store.pushSubscriptions.values()]
      .filter((s) => s.memberId === memberId)
      .map((s) => s.expoPushToken);
  }
}
