import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { FalTrainingRequestRecord, NotificationAdapter } from "@/adapters/types";
import { HardDeleteService } from "@/services/hard-delete";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";
import { createTestContext, goodPhoto } from "@/test/fixtures";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";
import {
  HUMAN_RELEASE_CHECKLIST,
  REACHABLE_FLOW_IDS,
  buildHumanChecklist,
  buildLiveOnlyBlockedEvidence,
  buildRetentionLimitation,
  createEvidencePacket,
  reconcileModerationEvidence,
  reconcileProviderCharges,
  runCrossFamilyRlsDenialProof,
  runHardDeleteEvidence,
  validateEvidencePacket,
  validateRlsPolicyContract,
  type EvidenceItem,
} from "../tools/evidence-reconciliation";

describe("197 — deterministic release evidence reconciliation", () => {
  it("requires every reachable flow to carry PASS/FAIL/BLOCKED evidence and blocks missing live proof", () => {
    const flows: EvidenceItem[] = REACHABLE_FLOW_IDS.map((id) => ({
      id,
      label: id,
      status: "PASS",
      evidenceClass: "deterministic",
      reproSteps: [`Run the deterministic ${id} fixture`],
      command: `npx vitest run tests/197-production-rls-delete-evidence.test.ts -t ${id}`,
      commandOutput: "PASS — deterministic fixture",
    }));
    const liveEvidence = buildLiveOnlyBlockedEvidence();
    const humanChecklist = buildHumanChecklist();
    const packet = createEvidencePacket({ flows, liveEvidence, humanChecklist });

    expect(packet.flowChecklist).toEqual({
      total: REACHABLE_FLOW_IDS.length,
      pass: REACHABLE_FLOW_IDS.length,
      fail: 0,
      blocked: 0,
    });
    expect(packet.decision.status).toBe("BLOCKED");
    expect(packet.releaseClaimAllowed).toBe(false);
    expect(packet.decision.rationale).toContain("live/native");
    expect(packet.items).toEqual(expect.arrayContaining(
      liveEvidence.map((item) => expect.objectContaining({
        id: item.id,
        status: "BLOCKED",
        missingStep: item.missingStep,
      })),
    ));
    expect(validateEvidencePacket(packet)).toEqual({ valid: true, errors: [] });

    expect(() => createEvidencePacket({
      flows: flows.slice(1),
      liveEvidence,
      humanChecklist,
    })).toThrow(/reachable flow evidence is missing/i);
  });

  it("rejects malformed status, checklist, and decision evidence instead of accepting a tampered packet", () => {
    const packet = createEvidencePacket({
      flows: REACHABLE_FLOW_IDS.map((id) => ({
        id,
        label: id,
        status: "PASS" as const,
        evidenceClass: "deterministic" as const,
        reproSteps: ["deterministic repro"],
        command: "deterministic command",
        commandOutput: "PASS",
      })),
      liveEvidence: buildLiveOnlyBlockedEvidence(),
      humanChecklist: buildHumanChecklist(),
    });
    const last = packet.items.at(-1)!;
    const invalid = validateEvidencePacket({
      ...packet,
      items: [...packet.items.slice(0, -1), { ...last, status: "UNKNOWN" as never }],
      decision: { ...packet.decision, status: "PASS" },
      releaseClaimAllowed: true,
      humanChecklist: {
        ...packet.humanChecklist,
        status: "PASS",
        followUps: packet.humanChecklist.followUps.map((followUp, index) => ({
          ...followUp,
          id: index === 0 ? "tampered-follow-up" : followUp.id,
        })),
      },
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/invalid evidence status/i),
      expect.stringMatching(/human checklist status/i),
      expect.stringMatching(/decision status/i),
      expect.stringMatching(/release claim/i),
      expect.stringMatching(/follow-up ids/i),
    ]));
  });

  it("rejects deterministic PASS for a live-only criterion and names every unchecked human follow-up", () => {
    const nativeItem = buildLiveOnlyBlockedEvidence().find((item) => item.id === "native-smoke")!;
    expect(() => createEvidencePacket({
      flows: REACHABLE_FLOW_IDS.map((id) => ({
        id,
        label: id,
        status: "PASS",
        evidenceClass: "deterministic" as const,
        reproSteps: ["deterministic repro"],
        command: "deterministic command",
        commandOutput: "PASS",
      })),
      liveEvidence: [{
        ...nativeItem,
        status: "PASS",
        evidenceClass: "live-only",
        missingStep: undefined,
      }],
      humanChecklist: buildHumanChecklist(),
    })).toThrow(/live-only evidence cannot be PASS/i);

    const checklist = buildHumanChecklist(HUMAN_RELEASE_CHECKLIST.map((item, index) => ({
      ...item,
      checked: index === 0,
    })));
    expect(checklist.unchecked.length).toBe(HUMAN_RELEASE_CHECKLIST.length - 1);
    expect(checklist.followUps).toHaveLength(HUMAN_RELEASE_CHECKLIST.length - 1);
    expect(checklist.followUps.every((followUp) => followUp.name && followUp.owner && followUp.action)).toBe(true);
  });

  it("proves cross-Family denial against the authenticated PostgreSQL policy boundary", async () => {
    await withIsolatedPostgres(async ({ asSystem, asUser, fixture }) => {
      const auditId = "00000000-0000-0000-0000-000000001977";
      await asSystem(
        `insert into moderation_audit (id, family_id, resource_type, resource_id, outcome)
         values ($1, $2, 'generated_image', 'family-b-page', 'allowed')`,
        [auditId, fixture.familyB.familyId],
      );

      const policyContract = validateRlsPolicyContract({
        sql: [
          readFileSync("supabase/migrations/002_full_domain.sql", "utf8"),
          readFileSync("supabase/migrations/013_provider_artifacts_rls_and_delete.sql", "utf8"),
          readFileSync("supabase/migrations/023_moderation_audit_family_ownership.sql", "utf8"),
        ].join("\n"),
        familyTables: ["personas"],
        serviceOnlyTables: ["moderation_audit"],
      });
      expect(policyContract.status).toBe("PASS");

      const proof = await runCrossFamilyRlsDenialProof({
        query: (sql, values) => asUser(fixture.familyA.authUserId, sql, values),
        targets: [
          { table: "personas", id: fixture.familyB.personaId },
          { table: "moderation_audit", id: auditId },
        ],
        policyContract,
        familyA: fixture.familyA.familyId,
        foreignFamily: fixture.familyB.familyId,
      });

      expect(proof.status).toBe("PASS");
      expect(proof.operations).toHaveLength(6);
      expect(proof.operations.every((operation) => operation.denied)).toBe(true);
      expect(proof.familyA).toBe(fixture.familyA.familyId);
      expect(proof.foreignFamily).toBe(fixture.familyB.familyId);
      expect(proof.operations.every((operation) => operation.commandOutput.includes("DENIED"))).toBe(true);

      expect((await asSystem("select id from moderation_audit where id = $1", [auditId])).rows).toHaveLength(1);
    });
  }, 15_000);

  it("reconciles moderation ownership and deletion without mistaking an inventory for RLS proof", () => {
    const good = reconcileModerationEvidence({
      familyId: "family-a",
      entries: [
        { id: "audit-a", familyId: "family-a", resourceId: "page-a" },
        { id: "audit-b", familyId: "family-b", resourceId: "page-b" },
      ],
      remainingAfterDelete: [{ id: "audit-b", familyId: "family-b", resourceId: "page-b" }],
      crossFamilyDenied: true,
      policyContract: { status: "PASS", errors: [] },
    });
    expect(good.status).toBe("PASS");
    expect(good.familyOwnedBeforeDelete).toBe(1);
    expect(good.familyOwnedAfterDelete).toBe(0);

    const unowned = reconcileModerationEvidence({
      familyId: "family-a",
      entries: [{ id: "audit-a", resourceId: "page-a" }],
      remainingAfterDelete: [],
      crossFamilyDenied: true,
      policyContract: { status: "PASS", errors: [] },
    });
    expect(unowned.status).toBe("FAIL");
    expect(unowned.errors[0]).toMatch(/family_id/i);
  });

  it("inventories and exercises DB, blob, derivative, context, provider, cache, CDN, backup, and queue deletion contracts", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-197-delete", "delete-197@example.test");
    const other = ctx.onboarding.ensureFamilyForNewUser("auth-197-keep", "keep-197@example.test");
    ctx.subscriptions.activateTrial(guardian.familyId);
    ctx.subscriptions.recordConsent(guardian.familyId, guardian.id, "US");
    const persona = await ctx.rawPersonas.createBaby({
      memberId: guardian.id,
      displayName: "Maya",
      photos: [goodPhoto(0x31), goodPhoto(0x32), goodPhoto(0x33)],
    });
    const baby = ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
    const now = new Date("2026-08-05T00:00:00.000Z");
    const request: FalTrainingRequestRecord = {
      requestId: "fal-request-197",
      familyId: guardian.familyId,
      personaId: persona.id,
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: "delete-197-training",
      status: "ready",
      loraWeightKey: `lora/${guardian.familyId}/persona/weights.safetensors`,
      configurationKey: `lora/${guardian.familyId}/persona/config.json`,
      createdAt: now,
      updatedAt: now,
    };
    ctx.store.falTrainingRequests.set(request.requestId, request);
    ctx.store.falWebhookReceipts.set("receipt-197", {
      requestId: request.requestId,
      fingerprint: "fingerprint-197",
      receivedAt: now,
    });
    ctx.store.saveModerationAudit({
      id: "moderation-197",
      familyId: guardian.familyId,
      resourceType: "persona_photo",
      resourceId: persona.id,
      outcome: "allowed",
      reason: null,
      createdAt: now,
    });
    ctx.store.storyContextProvenance.set("context-197", {
      id: "context-197",
      familyId: guardian.familyId,
      storybookId: "book-197",
      babyId: baby.id,
      personaIds: [persona.id],
      momentIds: [],
      tokenEstimate: 1,
    });
    new ProviderCostMeteringService(ctx.store).recordAttempt({
      provider: "fal",
      endpoint: request.endpoint,
      model: request.model,
      pricingVersion: "test-197",
      units: { trainings: 1 },
      estimatedCostUsd: 0.4,
      actualCostUsd: 0.4,
      latencyMs: 10,
      requestId: "request-cost-197",
      providerRequestId: "provider-cost-197",
      owningEntityIds: { familyId: guardian.familyId, personaId: persona.id },
      attemptType: "training",
      outcome: "succeeded",
    });

    const customReferencedKey = `custom/${guardian.familyId}/unusual-blob.bin`;
    persona.avatarKey = customReferencedKey;
    ctx.store.savePersona(persona);
    const ownedKeys = [
      customReferencedKey,
      `photos/${guardian.familyId}/source.jpg`,
      `training-inputs/${guardian.familyId}/input.zip`,
      `lora/${guardian.familyId}/persona/weights.safetensors`,
      `avatars/${guardian.familyId}/${persona.id}/avatar.png`,
      `likeness-samples/${guardian.familyId}/${persona.id}/sample.png`,
      `books/${guardian.familyId}/book-197/page-0.png`,
      `styles/${guardian.familyId}/style.bin`,
    ];
    for (const key of ownedKeys) await ctx.blobs.put(key, Buffer.from(key));
    await ctx.blobs.put(`photos/${other.familyId}/keep.jpg`, Buffer.from("keep"));

    const externalState = new Map<string, boolean>([
      ["cache", true],
      ["cdn", true],
      ["backup", true],
      ["retention-queue", true],
    ]);
    const calls: string[] = [];
    const externalStores = [...externalState.keys()].map((kind) => ({
      kind: kind as "cache" | "cdn" | "backup" | "retention-queue",
      inventory: async (familyId: string) => externalState.get(kind) && familyId === guardian.familyId
        ? [{ id: `${kind}-197`, familyId }]
        : [],
      delete: async (artifact: { id: string; familyId: string }) => {
        calls.push(artifact.id);
        externalState.set(kind, false);
        return { status: "deleted" as const, commandOutput: `deleted ${artifact.id}` };
      },
    }));
    const deletedProviderArtifacts: string[] = [];
    const notifications: NotificationAdapter = {
      sendEmail: async () => undefined,
      sendWebPush: async () => undefined,
    };
    const makeDelete = () => new HardDeleteService(ctx.store, ctx.blobs, notifications, {
      deleteArtifact: async (key) => {
        deletedProviderArtifacts.push(key);
      },
    });

    const evidence = await runHardDeleteEvidence({
      familyId: guardian.familyId,
      guardianMemberId: guardian.id,
      hardDelete: makeDelete(),
      restartHardDelete: makeDelete,
      store: ctx.store,
      blobs: ctx.blobs,
      externalStores,
      providerRetentionLimitations: [],
    });

    expect(evidence.status).toBe("PASS");
    expect(evidence.inventory.database.falTrainingRequests).toBe(1);
    expect(evidence.inventory.blobs.sourcePhotos).toBeGreaterThanOrEqual(2);
    expect(evidence.inventory.blobs.derivatives).toBeGreaterThan(0);
    expect(evidence.inventory.blobs.keys).toContain(customReferencedKey);
    expect(evidence.inventory.database.storyContextProvenance).toBe(1);
    expect(evidence.attempts.filter((attempt) => attempt.status === "PASS")).toHaveLength(
      externalStores.length + deletedProviderArtifacts.length +
        Object.values(evidence.inventory.database).reduce((sum, count) => sum + count, 0) +
        evidence.inventory.blobs.keys.length,
    );
    expect(evidence.attempts.filter((attempt) => attempt.category === "database").every((attempt) => attempt.status === "PASS")).toBe(true);
    expect(evidence.attempts.filter((attempt) => attempt.category === "blob").every((attempt) => attempt.status === "PASS")).toBe(true);
    expect(new Set(calls)).toEqual(new Set([...externalState.keys()].map((kind) => `${kind}-197`)));
    expect(deletedProviderArtifacts).toEqual(expect.arrayContaining([
      request.loraWeightKey!,
      request.configurationKey!,
    ]));
    expect(evidence.restart.idempotent).toBe(true);
    expect(evidence.residuals.database).toEqual({});
    expect(evidence.residuals.blobs).toEqual([]);
    expect(await ctx.blobs.get(`photos/${other.familyId}/keep.jpg`)).toEqual(Buffer.from("keep"));
    expect(ctx.store.familyDataExists(other.familyId)).toBe(true);
  });

  it("records retention limitations as BLOCKED only when owner, expiry, retry, and user status are complete", async () => {
    const limitation = buildRetentionLimitation({
      artifactId: "backup-197",
      category: "backup",
      reason: "Immutable backup snapshot cannot be rewritten",
      owner: "Platform on-call",
      expiryWindow: "Expires within 35 days",
      retryBehavior: "Retry deletion on the next backup compaction",
      userVisibleStatus: "Deletion requested; backup copy expires within 35 days",
    });
    expect(limitation.owner).toBe("Platform on-call");

    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-197-retention", "retention-197@example.test");
    let retained = true;
    const evidence = await runHardDeleteEvidence({
      familyId: guardian.familyId,
      guardianMemberId: guardian.id,
      hardDelete: ctx.hardDelete,
      restartHardDelete: () => new HardDeleteService(ctx.store, ctx.blobs, ctx.notifications),
      store: ctx.store,
      blobs: ctx.blobs,
      externalStores: [{
        kind: "backup",
        inventory: async () => retained ? [{ id: "backup-197", familyId: guardian.familyId }] : [],
        delete: async () => {
          retained = true;
          return { status: "retained" as const, commandOutput: "backup retention policy kept copy", limitation };
        },
      }],
      providerRetentionLimitations: [],
    });
    expect(evidence.status).toBe("BLOCKED");
    expect(evidence.retentionLimitations).toEqual([limitation]);
    expect(evidence.attempts.find((attempt) => attempt.artifactId === "backup-197")?.status).toBe("BLOCKED");

    expect(() => buildRetentionLimitation({
      ...limitation,
      owner: "",
    })).toThrow(/owner/i);
  });

  it("marks provider deletion limitations BLOCKED only with a complete retention record", async () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-197-provider-retention", "provider-retention-197@example.test");
    const artifactKey = `lora/${guardian.familyId}/provider-owned.safetensors`;
    ctx.store.falTrainingRequests.set("fal-retention-197", {
      requestId: "fal-retention-197",
      familyId: guardian.familyId,
      personaId: "persona-retention-197",
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: "retention-197",
      status: "ready",
      loraWeightKey: artifactKey,
      createdAt: new Date("2026-08-05T00:00:00.000Z"),
      updatedAt: new Date("2026-08-05T00:00:00.000Z"),
    });
    const limitation = buildRetentionLimitation({
      artifactId: artifactKey,
      category: "provider",
      reason: "Provider contract has no artifact-delete endpoint",
      owner: "Provider support owner",
      expiryWindow: "Provider retention window: 30 days",
      retryBehavior: "Retry provider deletion request after contract review",
      userVisibleStatus: "Family copy deleted; provider copy is retained until the stated window expires",
    });
    const evidence = await runHardDeleteEvidence({
      familyId: guardian.familyId,
      guardianMemberId: guardian.id,
      hardDelete: ctx.hardDelete,
      restartHardDelete: () => new HardDeleteService(ctx.store, ctx.blobs, ctx.notifications),
      store: ctx.store,
      blobs: ctx.blobs,
      externalStores: [],
      providerRetentionLimitations: [limitation],
    });
    expect(evidence.status).toBe("BLOCKED");
    expect(evidence.attempts).toContainEqual(expect.objectContaining({ artifactId: artifactKey, status: "BLOCKED" }));
    expect(evidence.retentionLimitations).toEqual([limitation]);
  });

  it("maps actual provider charges to request IDs and blocks without invoice evidence or an approved budget", () => {
    const ctx = createTestContext();
    const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-197-cost", "cost-197@example.test");
    const entry = new ProviderCostMeteringService(ctx.store).recordAttempt({
      provider: "fal",
      endpoint: "fal-ai/flux-2",
      model: "flux-2",
      pricingVersion: "test-197",
      units: { images: 1 },
      estimatedCostUsd: 0.4,
      actualCostUsd: 0.4,
      latencyMs: 10,
      requestId: "request-197-charge",
      providerRequestId: "provider-197-charge",
      owningEntityIds: { familyId: guardian.familyId },
      attemptType: "image",
      outcome: "succeeded",
    });

    const reconciled = reconcileProviderCharges({
      familyId: guardian.familyId,
      ledgerEntries: [entry],
      charges: [{ id: "invoice-line-197", provider: "fal", providerRequestId: entry.providerRequestId, amountUsd: 0.4 }],
      approvedBudgetUsd: 1,
    });
    expect(reconciled.status).toBe("PASS");
    expect(reconciled.mappings).toEqual([expect.objectContaining({
      chargeId: "invoice-line-197",
      requestId: "request-197-charge",
      providerRequestId: "provider-197-charge",
    })]);
    expect(reconciled.totalActualCostUsd).toBe(0.4);

    const missing = reconcileProviderCharges({
      familyId: guardian.familyId,
      ledgerEntries: [entry],
      charges: [],
      approvedBudgetUsd: 1,
    });
    expect(missing.status).toBe("BLOCKED");
    expect(missing.missingEvidence).toEqual(expect.arrayContaining([expect.stringMatching(/invoice|billing/i)]));
  });
});
