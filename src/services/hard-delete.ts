import type { BlobStore, NotificationAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";

export interface ProviderArtifactDeletionAdapter {
  /** Delete a provider-owned copy when the provider exposes that capability. */
  deleteArtifact?(key: string, requestId?: string): Promise<void>;
}

export interface HardDeleteLimitation {
  code: "provider_delete_unavailable" | "provider_delete_failed";
  requestId?: string;
  artifactKey?: string;
  message: string;
}

export interface HardDeleteReport {
  familyId: string;
  inventory: Record<string, number>;
  deleted: {
    database: Record<string, number>;
    blobKeys: string[];
    providerArtifacts: string[];
  };
  retained: { costLedgerEntries: number };
  provider: { limitations: HardDeleteLimitation[] };
}

function isTemporaryProviderUrl(value: string): boolean {
  return /^(?:https?|data|blob):/i.test(value);
}

function isLocalOwnedKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !isTemporaryProviderUrl(value);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class HardDeleteService {
  private readonly completedGuardianDeletes = new Set<string>();

  constructor(
    private readonly store: DataStore,
    private readonly blobs: BlobStore,
    private readonly notifications: NotificationAdapter,
    private readonly provider?: ProviderArtifactDeletionAdapter,
  ) {}

  async hardDelete(guardianMemberId: string): Promise<HardDeleteReport> {
    const guardian = this.store.members.get(guardianMemberId);
    if (!guardian) {
      // A repeated call with the same authenticated Guardian id is safe after
      // the first call erased the Member row. Unknown ids remain unauthorized.
      if (this.completedGuardianDeletes.has(guardianMemberId)) {
        return this.emptyReport(guardianMemberId);
      }
      throw new Error("Only guardians may hard-delete family data");
    }
    if (guardian.role !== "guardian") {
      throw new Error("Only guardians may hard-delete family data");
    }
    const report = await this.purgeFamily(guardian.familyId);
    this.completedGuardianDeletes.add(guardianMemberId);
    return report;
  }

  async purgeFamily(familyId: string): Promise<HardDeleteReport> {
    const personas = [...this.store.personas.values()].filter((p) => p.familyId === familyId);
    const storybooks = [...this.store.storybooks.values()].filter((b) => b.familyId === familyId);
    const bookIds = new Set(storybooks.map((book) => book.id));
    const pages = [...this.store.pages.values()].filter((page) => bookIds.has(page.storybookId));
    const babies = [...this.store.babies.values()].filter((baby) => baby.familyId === familyId);
    const babyIds = new Set(babies.map((baby) => baby.id));
    const bonds = [...this.store.babyPersonBonds.values()].filter((bond) => babyIds.has(bond.babyId));
    const consentReceipts = [...this.store.consentReceipts.values()].filter((r) => r.familyId === familyId);
    const falRequests = [...this.store.falTrainingRequests.values()].filter((r) => r.familyId === familyId);
    const requestIds = new Set(falRequests.map((request) => request.requestId));
    const falReceipts = [...this.store.falWebhookReceipts.values()].filter((r) => requestIds.has(r.requestId));
    const provenance = [...this.store.storyContextProvenance.values()].filter((r) => r.familyId === familyId);
    const reservations = [...this.store.storyAllowanceReservations.values()].filter((r) => r.familyId === familyId);
    const costLedgerEntries = [...this.store.providerCostLedgerEntries.values()].filter(
      (entry) => entry.owningEntityIds.familyId === familyId
    );

    const limitations: HardDeleteLimitation[] = [];
    const deletedProviderArtifacts: string[] = [];
    for (const request of falRequests) {
      const providerKeys = unique(
        [request.loraWeightKey, request.configurationKey].filter(isLocalOwnedKey)
      );
      for (const key of providerKeys) {
        if (!this.provider?.deleteArtifact) {
          limitations.push({
            code: "provider_delete_unavailable",
            requestId: request.requestId,
            artifactKey: key,
            message: "fal does not expose provider-artifact deletion; local Family copy was erased",
          });
          continue;
        }
        try {
          await this.provider.deleteArtifact(key, request.requestId);
          deletedProviderArtifacts.push(key);
        } catch (error) {
          limitations.push({
            code: "provider_delete_failed",
            requestId: request.requestId,
            artifactKey: key,
            message: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
          });
        }
      }
    }

    const ownedBlobKeys = new Set<string>();
    const listOwned = async (prefix: string): Promise<void> => {
      for (const key of await this.blobs.list(prefix)) {
        if (isLocalOwnedKey(key)) ownedBlobKeys.add(key);
      }
    };
    await listOwned(`photos/${familyId}/`);
    await listOwned(`persona-creation/${familyId}/`);
    await listOwned(`lora/${familyId}/`);
    await listOwned(`training-inputs/${familyId}/`);
    await listOwned(`books/${familyId}/`);
    await listOwned(`styles/${familyId}/`);
    for (const persona of personas) {
      await listOwned(`photos/${persona.id}/`);
      await listOwned(`voice/${persona.id}/`);
      await listOwned(`avatars/${familyId}/${persona.id}/`);
      await listOwned(`likeness-samples/${familyId}/${persona.id}/`);
      for (const key of [persona.loraWeightKey, persona.avatarKey, ...(persona.reviewSampleKeys ?? [])]) {
        if (isLocalOwnedKey(key)) ownedBlobKeys.add(key);
      }
    }
    for (const request of falRequests) {
      for (const key of [request.inputZipKey, request.loraWeightKey, request.configurationKey]) {
        if (isLocalOwnedKey(key)) ownedBlobKeys.add(key);
      }
    }
    for (const style of this.store.customStyles.values()) {
      if (style.familyId === familyId && isLocalOwnedKey(style.loraWeightKey)) {
        ownedBlobKeys.add(style.loraWeightKey);
      }
    }
    for (const page of pages) {
      for (const key of [page.illustrationBlobKey, page.videoBlobKey]) {
        if (isLocalOwnedKey(key)) ownedBlobKeys.add(key);
      }
    }
    for (const book of storybooks) await listOwned(`${book.id}/`);

    const deletedBlobKeys: string[] = [];
    for (const key of ownedBlobKeys) {
      // Provider URLs are temporary inputs and are not in ownedBlobKeys. The
      // guard is repeated here so a malformed persisted field cannot broaden a
      // local deletion into a provider request.
      if (!isLocalOwnedKey(key)) continue;
      await this.blobs.delete(key);
      deletedBlobKeys.push(key);
    }

    this.store.hardDeleteFamily(familyId);

    return {
      familyId,
      inventory: {
        families: this.store.families.has(familyId) ? 1 : 1,
        members: [...this.store.members.values()].filter((m) => m.familyId === familyId).length,
        personas: personas.length,
        babies: babies.length,
        babyPersonBonds: bonds.length,
        consentReceipts: consentReceipts.length,
        sourcePhotos: [...ownedBlobKeys].filter(
          (key) => key.startsWith("photos/") || key.startsWith("persona-creation/"),
        ).length,
        reviewSamples: [...ownedBlobKeys].filter((key) => key.startsWith("likeness-samples/")).length,
        avatars: [...ownedBlobKeys].filter((key) => key.startsWith("avatars/")).length,
        falTrainingRequests: falRequests.length,
        falWebhookReceipts: falReceipts.length,
        loraArtifacts: [...ownedBlobKeys].filter((key) => key.startsWith("lora/")).length,
        storyContextProvenance: provenance.length,
        storyAllowanceReservations: reservations.length,
        storybooks: storybooks.length,
        pages: pages.length,
        providerCostLedger: costLedgerEntries.length,
      },
      deleted: {
        database: {
          babies: babies.length,
          babyPersonBonds: bonds.length,
          consentReceipts: consentReceipts.length,
          falTrainingRequests: falRequests.length,
          falWebhookReceipts: falReceipts.length,
          storyContextProvenance: provenance.length,
          storyAllowanceReservations: reservations.length,
          storybooks: storybooks.length,
          pages: pages.length,
        },
        blobKeys: deletedBlobKeys,
        providerArtifacts: deletedProviderArtifacts,
      },
      retained: { costLedgerEntries: costLedgerEntries.length },
      provider: { limitations },
    };
  }

  private emptyReport(familyId: string): HardDeleteReport {
    return {
      familyId,
      inventory: {},
      deleted: { database: {}, blobKeys: [], providerArtifacts: [] },
      retained: { costLedgerEntries: 0 },
      provider: { limitations: [] },
    };
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
