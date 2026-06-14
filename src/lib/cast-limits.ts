import type { DataStore } from "@/db/store";
import type { SubscriptionService } from "@/services/subscription";

/** Free tier: combined personas + characters. Paid: no hard cap in v1. */
export const FREE_CAST_LIMIT = 3;

export function countCastMembers(
  store: DataStore,
  familyId: string,
  memberId: string
): number {
  return (
    store.getPersonasByFamily(familyId, memberId).length +
    store.getCharactersByFamily(familyId, memberId).length
  );
}

export function castSlotInfo(
  subscriptions: SubscriptionService,
  store: DataStore,
  familyId: string,
  memberId: string
) {
  const subscribed = subscriptions.isActive(familyId);
  const used = countCastMembers(store, familyId, memberId);
  const limit = subscribed ? null : FREE_CAST_LIMIT;
  const remaining = limit === null ? null : Math.max(0, limit - used);
  const canAdd = subscribed || used < FREE_CAST_LIMIT;
  return { subscribed, used, limit, remaining, canAdd };
}

export function castLimitError(subscribed: boolean): string {
  if (subscribed) return "Cast limit reached.";
  return `Free accounts can add up to ${FREE_CAST_LIMIT} characters and family members combined. Upgrade for illustrated photos and more.`;
}
