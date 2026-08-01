import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { FalTrainingRequestRecord, FalWebhookReceipt, NotificationAdapter } from "@/adapters/types";
import { RlsViolationError } from "@/db/store";
import type { Baby, BabyPersonBond, ConsentReceipt, Page, Persona, Storybook } from "@/domain/types";
import { HardDeleteService } from "@/services/hard-delete";
import { CostThreshold, type ProviderCostLedgerEntry } from "@/services/provider-cost-metering";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { createTestContext, goodPhoto } from "@/test/fixtures";

const MIGRATION_PATH = "supabase/migrations/013_provider_artifacts_rls_and_delete.sql";
const SCHEMA_PATH = "CONTEXT/local-dev/schema.sql";

const FAMILY_OWNED_TABLES = [
  "families",
  "members",
  "personas",
  "babies",
  "baby_person_bonds",
  "consent_receipts",
  "storybooks",
  "pages",
  "page_candidates",
  "persisted_generations",
  "story_allowance_reservations",
  "fal_training_requests",
  "fal_webhook_receipts",
  "provider_cost_ledger",
  "story_context_provenance",
] as const;

type DeleteReport = {
  familyId: string;
  inventory: Record<string, number>;
  deleted: { database: Record<string, number>; blobKeys: string[]; providerArtifacts: string[] };
  provider: {
    limitations: Array<{ code: string; requestId?: string; message: string }>;
  };
};

const notifications: NotificationAdapter = {
  sendEmail: async () => undefined,
  sendWebPush: async () => undefined,
};

function asMap<T>(value: unknown): Map<string, T> {
  return value as Map<string, T>;
}

describe("184 — provider artifacts, RLS, and inventory-based Hard-delete", () => {
  it("production migrations enable RLS and provide policies for every Family-owned table in scope", () => {
    const migration = readFileSync(MIGRATION_PATH, "utf8").toLowerCase();
    const schema = readFileSync(SCHEMA_PATH, "utf8").toLowerCase();

    for (const table of FAMILY_OWNED_TABLES) {
      expect(migration).toMatch(new RegExp(`alter table(?: if exists)? ${table} enable row level security`));
      expect(migration).toMatch(new RegExp(`create policy[\\s\\S]+?on ${table}\\s+for`));
      expect(schema).toMatch(new RegExp(`alter table(?: if exists)? ${table} enable row level security`));
    }
  });

  it("authenticated Families cannot read, update, delete, or infer another Family's rows or object keys", async () => {
    const ctx = createTestContext();
    const one = ctx.onboarding.ensureFamilyForNewUser("rls-184-one", "one@example.com");
    const two = ctx.onboarding.ensureFamilyForNewUser("rls-184-two", "two@example.com");
    const persona = await ctx.personas.createAdult({
      memberId: one.id,
      displayName: "One",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    persona.reviewSampleKeys = [`likeness-samples/${one.familyId}/${persona.id}/sample.png`];
    persona.avatarKey = `avatars/${one.familyId}/${persona.id}/generation-1.png`;
    persona.loraWeightKey = `lora/${one.familyId}/${persona.id}/weights.safetensors`;
    ctx.store.savePersona(persona);
    await ctx.blobs.put(persona.avatarKey!, Buffer.from("avatar"));
    await ctx.blobs.put(persona.reviewSampleKeys![0]!, Buffer.from("sample"));
    await ctx.blobs.put(persona.loraWeightKey!, Buffer.from("weights"));

    expect(() => ctx.store.getPersona(persona.id, two.id)).toThrow(RlsViolationError);
    expect(() => ctx.store.getPersonasByFamily(one.familyId, two.id)).toThrow(RlsViolationError);
    const isolatedStore = ctx.store as typeof ctx.store & {
      updatePersona(id: string, actorMemberId: string, patch: { displayName: string }): void;
      deletePersona(id: string, actorMemberId: string): void;
      getFamilyOwnedObjectKeys(familyId: string, actorMemberId: string): string[];
    };
    expect(() => isolatedStore.updatePersona(persona.id, two.id, { displayName: "stolen" })).toThrow(RlsViolationError);
    expect(() => isolatedStore.deletePersona(persona.id, two.id)).toThrow(RlsViolationError);
    expect(() => isolatedStore.getFamilyOwnedObjectKeys(one.familyId, two.id)).toThrow(RlsViolationError);
    expect(await ctx.blobs.get(persona.loraWeightKey!)).toEqual(Buffer.from("weights"));
  });

  it("inventories and erases every owned DB/blob/provider artifact idempotently", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("delete-184", "delete@example.com");
    const otherGuardian = ctx.onboarding.ensureFamilyForNewUser("keep-184", "keep@example.com");
    const now = new Date();
    const baby: Baby = {
      id: "baby-184",
      familyId: guardian.familyId,
      displayName: "Baby",
      birthDate: null,
      dailyRoutine: null,
      rosterGroupId: "roster-184",
      rosterScope: "shared",
      isDefault: true,
      createdAt: now,
    };
    const persona: Persona = {
      id: "persona-184",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Baby Persona",
      status: "ready",
      loraWeightKey: `lora/${guardian.familyId}/persona-184/weights.safetensors`,
      avatarKey: `avatars/${guardian.familyId}/persona-184/generation-7.png`,
      reviewSampleKeys: [`likeness-samples/${guardian.familyId}/persona-184/sample-1.png`],
      likenessConfirmed: true,
      createdAt: now,
    };
    const bond: BabyPersonBond = {
      id: "bond-184",
      babyId: baby.id,
      personaId: persona.id,
      relationship: "child",
      babyCallsThem: "Mama",
      theyCallBaby: "sunshine",
    };
    const consent: ConsentReceipt = {
      id: "consent-184",
      familyId: guardian.familyId,
      memberId: guardian.id,
      jurisdiction: "US",
      noticeVersion: "v184",
      method: "email_plus",
      status: "verified",
      consentedAt: now,
    };
    const book: Storybook = {
      id: "book-184",
      familyId: guardian.familyId,
      babyId: baby.id,
      createdByMemberId: guardian.id,
      status: "draft",
      brief: { starringPersonaIds: [persona.id], storyType: "bedtime", theme: "moon" },
      styleBible: null,
      rerollBudgetRemaining: 5,
      rerollCredits: 0,
      createdAt: now,
      finalizedAt: null,
    };
    const page: Page = {
      id: "book-184-page-0",
      storybookId: book.id,
      index: 0,
      text: "A quiet moon.",
      illustrationUrl: "https://fal.media/temporary-page.png",
      illustrationBlobKey: `books/${guardian.familyId}/${book.id}/page-0.png`,
      videoBlobKey: `books/${guardian.familyId}/${book.id}/page-0.mp4`,
      videoUrl: "https://fal.media/temporary-video.mp4",
      voiceClipId: null,
      generationStatus: "ready",
      personaCount: 1,
    };
    const falRequest: FalTrainingRequestRecord = {
      requestId: "fal-request-184",
      familyId: guardian.familyId,
      personaId: persona.id,
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: "delete-184-training",
      status: "ready",
      inputZipKey: `training-inputs/${guardian.familyId}/${persona.id}/input.zip`,
      loraWeightKey: persona.loraWeightKey!,
      configurationKey: `lora/${guardian.familyId}/${persona.id}/config.json`,
      createdAt: now,
      updatedAt: now,
    };
    const falReceipt: FalWebhookReceipt = {
      requestId: falRequest.requestId,
      fingerprint: "fingerprint-184",
      receivedAt: now,
    };
    const ledger: ProviderCostLedgerEntry = {
      id: "cost-184",
      provider: "fal",
      endpoint: "fal-ai/flux-2/lora",
      model: "flux-2-lora-v2",
      pricingVersion: "2026-07-20",
      units: { images: 1 },
      estimatedCostUsd: 0.45,
      actualCostUsd: 0.45,
      latencyMs: 100,
      requestId: "cost-request-184",
      providerRequestId: "cost-request-184",
      owningEntityIds: { familyId: guardian.familyId, personaId: persona.id, storybookId: book.id, pageId: page.id },
      attemptType: "image",
      outcome: "succeeded",
      costCategory: "provider_attempt",
      createdAt: now,
    };
    Object.assign(ledger, { prompt: "raw prompt must not survive", credentials: "secret" });

    ctx.store.babies.set(baby.id, baby);
    ctx.store.savePersona(persona);
    ctx.store.babyPersonBonds.set(bond.id, bond);
    ctx.store.consentReceipts.set(consent.id, consent);
    ctx.store.storybooks.set(book.id, book);
    ctx.store.pages.set(page.id, page);
    ctx.store.falTrainingRequests.set(falRequest.requestId, falRequest);
    ctx.store.falWebhookReceipts.set(falReceipt.fingerprint, falReceipt);
    ctx.store.providerCostLedgerEntries.set(ledger.id, ledger);
    ctx.store.providerKillSwitches.set("switch-184", {
      id: "switch-184",
      familyId: guardian.familyId,
      scope: "endpoint",
      endpoint: "fal-ai/flux-2/lora",
      threshold: CostThreshold.RED,
      reason: "Family-scoped provider control",
      createdAt: now,
      active: true,
    });
    ctx.store.saveModerationAudit({
      id: "moderation-page-184",
      familyId: guardian.familyId,
      resourceType: "generated_image",
      resourceId: `${book.id}/page-0`,
      outcome: "allowed",
      reason: null,
      createdAt: now,
    });
    ctx.store.saveModerationAudit({
      id: "moderation-keep-184",
      familyId: otherGuardian.familyId,
      resourceType: "generated_image",
      // Explicit ownership is authoritative even if a legacy resource ID
      // collides with a deleted Family's production Page identifier.
      resourceId: `${book.id}/page-0`,
      outcome: "allowed",
      reason: null,
      createdAt: now,
    });
    asMap<unknown>((ctx.store as unknown as { storyContextProvenance: Map<string, unknown> }).storyContextProvenance).set(
      "provenance-184",
      {
        id: "provenance-184",
        familyId: guardian.familyId,
        storybookId: book.id,
        babyId: baby.id,
        personaIds: [persona.id],
        momentIds: ["moment-184"],
        tokenEstimate: 20,
      }
    );
    ctx.store.storyAllowanceReservations.set("reservation-184", {
      storybookId: book.id,
      familyId: guardian.familyId,
      status: "committed",
      createdAt: now,
    });

    const reviewSampleKey = persona.reviewSampleKeys![0]!;
    const ownedKeys = [
      `photos/${persona.id}/source.jpg`,
      falRequest.inputZipKey!,
      reviewSampleKey,
      persona.avatarKey!,
      persona.loraWeightKey!,
      falRequest.configurationKey!,
      page.illustrationBlobKey!,
      page.videoBlobKey!,
    ];
    for (const key of ownedKeys) await ctx.blobs.put(key, Buffer.from(key));
    const temporaryProviderUrl = "https://fal.media/temporary-output.safetensors";
    await ctx.blobs.put(temporaryProviderUrl, Buffer.from("provider-owned"));

    const provider = {
      deleteArtifact: async (_key: string): Promise<void> => {
        throw new Error("fal provider degraded; deletion endpoint unavailable");
      },
    };
    const HardDeleteWithProvider = HardDeleteService as unknown as new (
      store: typeof ctx.store,
      blobs: typeof ctx.blobs,
      notifications: NotificationAdapter,
      provider: { deleteArtifact(key: string, requestId?: string): Promise<void> },
    ) => HardDeleteService;
    const hardDelete = new HardDeleteWithProvider(ctx.store, ctx.blobs, notifications, provider);
    const report = (await hardDelete.hardDelete(guardian.id)) as unknown as DeleteReport;

    expect(report.inventory).toEqual(expect.objectContaining({
      families: 1,
      members: 1,
      babies: 1,
      babyPersonBonds: 1,
      consentReceipts: 1,
      moderationAudit: 1,
      providerKillSwitches: 1,
      sourcePhotos: 1,
      reviewSamples: 1,
      avatars: 1,
      falTrainingRequests: 1,
      falWebhookReceipts: 1,
      loraArtifacts: 2,
      storyContextProvenance: 1,
      storybooks: 1,
      pages: 1,
      providerCostLedger: 1,
    }));
    expect(report.provider.limitations.length).toBeGreaterThan(0);
    expect(report.provider.limitations[0]?.code).toMatch(/provider/i);
    expect(JSON.stringify(report.provider.limitations)).not.toMatch(/fal provider degraded|https?:\/\/|token|secret/i);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
    expect(ctx.store.babies.size).toBe(0);
    expect(ctx.store.babyPersonBonds.size).toBe(0);
    expect(ctx.store.personas.size).toBe(0);
    expect(ctx.store.consentReceipts.size).toBe(0);
    expect(ctx.store.storybooks.size).toBe(0);
    expect(ctx.store.pages.size).toBe(0);
    expect(ctx.store.falTrainingRequests.size).toBe(0);
    expect(ctx.store.falWebhookReceipts.size).toBe(0);
    expect(asMap<unknown>((ctx.store as unknown as { storyContextProvenance: Map<string, unknown> }).storyContextProvenance).size).toBe(0);
    expect(report.deleted.database.providerCostLedger).toBe(1);
    expect(report.deleted.database.moderationAudit).toBe(1);
    expect(report.deleted.database.providerKillSwitches).toBe(1);
    expect(ctx.store.providerCostLedgerEntries.size).toBe(0);
    expect(ctx.store.providerKillSwitches.size).toBe(0);
    expect([...ctx.store.moderationAudit.keys()]).toEqual(["moderation-keep-184"]);
    expect(await ctx.blobs.get(temporaryProviderUrl)).toEqual(Buffer.from("provider-owned"));
    for (const key of ownedKeys) expect(await ctx.blobs.get(key)).toBeNull();

    const second = (await hardDelete.hardDelete(guardian.id)) as unknown as DeleteReport;
    expect(second.provider.limitations).toEqual([]);
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
  });

  it("revoked consent schedules child-data purge and cannot leave a ready Persona or usable LoRA", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("revoke-184", "revoke@example.com", "US_IOS");
    const vpc = new EmailPlusVpcService(ctx.store, ctx.notifications, "http://localhost:3000");
    const request = vpc.requestConsent(guardian.id, guardian.email);
    await vpc.sendConsentLink(request.id);
    const token = ctx.store.emailPlusVpcRequests.get(request.id)!.token;
    vpc.confirmConsent(token);
    const persona: Persona = {
      id: "revoked-persona-184",
      familyId: guardian.familyId,
      createdByMemberId: guardian.id,
      kind: "baby",
      displayName: "Revoked Baby",
      status: "ready",
      loraWeightKey: `lora/${guardian.familyId}/revoked/weights.safetensors`,
      avatarKey: `avatars/${guardian.familyId}/revoked/generation-1.png`,
      reviewSampleKeys: [],
      likenessConfirmed: true,
      createdAt: new Date(),
    };
    ctx.store.savePersona(persona);
    await ctx.blobs.put(persona.loraWeightKey!, Buffer.from("usable"));

    vpc.revokeConsent(token);
    expect(ctx.store.purgeScheduled.has(guardian.familyId)).toBe(true);
    const schedule = ctx.store.purgeScheduled.get(guardian.familyId)!;
    schedule.purgeAt = new Date(Date.now() - 1);
    await ctx.hardDelete.runScheduledPurges();

    expect(ctx.store.personas.has(persona.id)).toBe(false);
    expect(await ctx.blobs.get(persona.loraWeightKey!)).toBeNull();
    expect(ctx.store.familyDataExists(guardian.familyId)).toBe(false);
  });
});
