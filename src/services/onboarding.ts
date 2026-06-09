import type { DataStore } from "@/db/store";
import type { Member } from "@/domain/types";

export class OnboardingService {
  constructor(private readonly store: DataStore) {}

  ensureFamilyForNewUser(authUserId: string, email: string, jurisdiction = "US"): Member {
    const existing = this.store.getMemberByAuthUserId(authUserId);
    if (existing) return existing;

    const family = this.store.createFamily();
    return this.store.createMember({
      authUserId,
      familyId: family.id,
      email,
      role: "guardian",
      selfPersonaId: null,
      jurisdiction,
    });
  }
}
