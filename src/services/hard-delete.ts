import type { BlobStore, NotificationAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";

export class HardDeleteService {
  constructor(
    private readonly store: DataStore,
    private readonly blobs: BlobStore,
    private readonly notifications: NotificationAdapter
  ) {}

  async hardDelete(guardianMemberId: string): Promise<void> {
    const guardian = this.store.members.get(guardianMemberId);
    if (!guardian || guardian.role !== "guardian") {
      throw new Error("Only guardians may hard-delete family data");
    }
    await this.purgeFamily(guardian.familyId);
  }

  async purgeFamily(familyId: string): Promise<void> {
    const personas = [...this.store.personas.values()].filter(
      (p) => p.familyId === familyId
    );
    for (const persona of personas) {
      await this.blobs.deletePrefix(`photos/${persona.id}`);
      await this.blobs.deletePrefix(`voice/${persona.id}`);
      await this.blobs.deletePrefix(`avatars/${familyId}/${persona.id}`);
      if (persona.loraWeightKey) {
        await this.blobs.delete(persona.loraWeightKey);
      }
      if (persona.avatarKey) {
        await this.blobs.delete(persona.avatarKey);
      }
    }
    await this.blobs.deletePrefix(`photos/${familyId}`);
    await this.blobs.deletePrefix(`lora/${familyId}`);
    await this.blobs.deletePrefix(`books/${familyId}`);
    await this.blobs.deletePrefix(`styles/${familyId}`);
    // Purge custom Style LoRA weights (issue 95)
    for (const [, style] of this.store.customStyles) {
      if (style.familyId === familyId && style.loraWeightKey) {
        await this.blobs.delete(style.loraWeightKey);
      }
    }
    await this.blobs.deletePrefix(`voice/`);
    const storybooks = [...this.store.storybooks.values()].filter(
      (b) => b.familyId === familyId
    );
    for (const book of storybooks) {
      await this.blobs.deletePrefix(`${book.id}/`);
    }
    this.store.hardDeleteFamily(familyId);
  }

  async runScheduledPurges(now = new Date()): Promise<string[]> {
    const purged: string[] = [];
    for (const [familyId, schedule] of this.store.purgeScheduled) {
      if (schedule.purgeAt <= now) {
        const members = this.store.getMembersByFamily(familyId);
        for (const m of members) {
          await this.notifications.sendEmail(
            m.email,
            "Export window ending",
            "Your 30-day export window has ended."
          );
        }
        await this.purgeFamily(familyId);
        purged.push(familyId);
      }
    }
    return purged;
  }

  isReadOnly(familyId: string): boolean {
    const sub = this.store.getSubscription(familyId);
    return sub?.status === "canceled";
  }
}
