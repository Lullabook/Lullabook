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
      // The prior call removes the Guardian row. A fresh request unit of work
      // cannot retain process-local completion state, so an already-erased
      // member id returns the same empty, non-disclosing completion report.
      // Initial deletion remains Guardian-gated below while a Member exists.
      return this.emptyReport(guardianMemberId);
    }
    if (guardian.role !== "guardian") {
      throw new Error("Only guardians may hard-delete family data");
    }
    const report = await this.purgeFamily(guardian.familyId);
    this.completedGuardianDeletes.add(guardianMemberId);
    return report;
  }

  async purgeFamily(familyId: string): Promise<HardDeleteReport> {
    const familyCount = this.store.families.has(familyId) ? 1 : 0;
    const members = [...this.store.members.values()].filter((member) => member.familyId === familyId);
    const moderationAuditIds = this.store.getModerationAuditIdsByFamily(familyId);
    const providerKillSwitches = [...this.store.providerKillSwitches.values()].filter(
      (control) => control.familyId === familyId
    );
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
    const creditLedgerEntries = [...this.store.creditLedgerEntries.values()].filter(
      (entry) => entry.familyId === familyId
    );
    const memberIds = new Set(members.map((member) => member.id));
    const pageIds = new Set(pages.map((page) => page.id));
    const databaseCounts: Record<string, number> = {
      families: familyCount,
      members: members.length,
      personas: personas.length,
      characters: [...this.store.characters.values()].filter((character) => character.familyId === familyId).length,
      subscriptions: this.store.subscriptions.has(familyId) ? 1 : 0,
      consentReceipts: consentReceipts.length,
      lightConsentReceipts: [...this.store.lightConsentReceipts.values()].filter((receipt) => receipt.familyId === familyId).length,
      storybooks: storybooks.length,
      pages: pages.length,
      pageCandidates: [...this.store.pageCandidates.values()].filter((candidate) => pageIds.has(candidate.pageId)).length,
      shareLinks: [...this.store.shareLinks.values()].filter((link) => bookIds.has(link.storybookId)).length,
      moderationAudit: moderationAuditIds.length,
      pendingBriefs: [...this.store.pendingBriefs.values()].filter((brief) => memberIds.has(brief.memberId)).length,
      invites: [...this.store.invites.values()].filter((invite) => invite.familyId === familyId).length,
      purgeScheduled: this.store.purgeScheduled.has(familyId) ? 1 : 0,
      persistedGenerations: [...this.store.persistedGenerations.values()].filter((generation) => bookIds.has(generation.storybookId)).length,
      textStories: [...this.store.textStories.values()].filter((story) => story.familyId === familyId).length,
      storyAllowanceReservations: reservations.length,
      providerCostLedger: costLedgerEntries.length,
      providerKillSwitches: providerKillSwitches.length,
      pushSubscriptions: [...this.store.pushSubscriptions.values()].filter((subscription) => memberIds.has(subscription.memberId)).length,
      emailPlusVpcRequests: [...this.store.emailPlusVpcRequests.values()].filter((request) => request.familyId === familyId).length,
      babies: babies.length,
      babyPersonBonds: bonds.length,
      voiceClips: [...this.store.voiceClips.values()].filter((clip) => clip.familyId === familyId).length,
      voiceConsentReceipts: [...this.store.voiceConsentReceipts.values()].filter((receipt) => receipt.familyId === familyId).length,
      moments: [...this.store.moments.values()].filter((moment) => moment.familyId === familyId).length,
      momentPeople: [...this.store.momentPeople.values()].filter((link) => this.store.moments.get(link.momentId)?.familyId === familyId).length,
      creditLedger: creditLedgerEntries.length,
      creditPurchasedBalance: this.store.creditPurchasedBalances.has(familyId) ? 1 : 0,
      babyAutoContextWatermarks: [...this.store.autoContextWatermarks.keys()].filter((babyId) => babyIds.has(babyId)).length,
      babyPastStorySummaries: [...this.store.babyPastStorySummaries.values()].filter((summary) => babyIds.has(summary.babyId)).length,
      journalNudgeStates: [...this.store.journalNudgeStates.values()].filter((state) => memberIds.has(state.memberId)).length,
      customStyles: [...this.store.customStyles.values()].filter((style) => style.familyId === familyId).length,
      falTrainingRequests: falRequests.length,
      falWebhookReceipts: falReceipts.length,
      storyContextProvenance: provenance.length,
    };

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
        } catch {
          // Provider errors can echo signed URLs, access tokens, or request
          // payload fragments. Reports are user-visible deletion evidence, so
          // retain only the stable failure category and request identifier.
          limitations.push({
            code: "provider_delete_failed",
            requestId: request.requestId,
            artifactKey: key,
            message: "Provider artifact deletion failed; local Family copy was erased",
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
    await listOwned(`photos-staging/${familyId}/`);
    await listOwned(`persona-creation/${familyId}/`);
    await listOwned(`lora/${familyId}/`);
    await listOwned(`training-inputs/${familyId}/`);
    await listOwned(`books/${familyId}/`);
    await listOwned(`styles/${familyId}/`);
    for (const persona of personas) {
      await listOwned(`photos/${persona.id}/`);
      // Legacy replacements omitted familyId from the staging prefix; clean
      // those persona-owned paths too while current writes use the scoped form.
      await listOwned(`photos-staging/${persona.id}/`);
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
        ...databaseCounts,
        babies: babies.length,
        babyPersonBonds: bonds.length,
        consentReceipts: consentReceipts.length,
        moderationAudit: moderationAuditIds.length,
        providerKillSwitches: providerKillSwitches.length,
        sourcePhotos: [...ownedBlobKeys].filter(
          (key) => key.startsWith("photos/") || key.startsWith("photos-staging/") || key.startsWith("persona-creation/"),
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
        creditLedger: creditLedgerEntries.length,
        creditPurchasedBalance: this.store.creditPurchasedBalances.has(familyId) ? 1 : 0,
      },
      deleted: {
        database: databaseCounts,
        blobKeys: deletedBlobKeys,
        providerArtifacts: deletedProviderArtifacts,
      },
      provider: { limitations },
    };
  }

  private emptyReport(familyId: string): HardDeleteReport {
    return {
      familyId,
      inventory: {},
      deleted: { database: {}, blobKeys: [], providerArtifacts: [] },
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
