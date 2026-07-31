import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { FakeFal } from "@/adapters/fakes";
import {
  createFalWebhookVerifier,
  encodeFalWebhookSignature,
  type FalWebhookHeaders,
} from "@/adapters/fal-webhook";
import type {
  FalImageResult,
  FalPageImageRequest,
  FalPageRepairRequest,
} from "@/adapters/types";
import { DataStoreFalTrainingLifecycleRepository } from "@/db/fal-training-lifecycle";
import { RlsViolationError } from "@/db/store";
import { FalTrainingWebhookService } from "@/services/fal-training-webhook";
import { HardDeleteService } from "@/services/hard-delete";
import {
  R1_PROVIDER_E2E_FLOW_PLAN,
  type R1ProviderE2EComposition,
  type R1ProviderE2EEvidence,
  type R1ProviderE2EStageEvidence,
} from "@/services/r1-provider-e2e";
import { createTestContext, goodPhoto } from "@/test/fixtures";

const CALLBACK_TIME_SECONDS = 1_800_000_000;

class R1HarnessFal extends FakeFal {
  readonly pageRequests: FalPageImageRequest[] = [];
  readonly repairRequests: FalPageRepairRequest[] = [];
  failRepairs = false;

  override async generatePageImage(input: FalPageImageRequest): Promise<FalImageResult> {
    this.pageRequests.push(structuredClone(input));
    return super.generatePageImage(input);
  }

  override async repairPageImage(input: FalPageRepairRequest): Promise<FalImageResult> {
    this.repairRequests.push(structuredClone(input));
    if (this.failRepairs) throw new Error("deterministic repair failure");
    return super.repairPageImage(input);
  }
}

function assertStage(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`R1 deterministic composition failed: ${message}`);
}

function makeSafetensorsArtifact(model: string): Buffer {
  const header = Buffer.from(JSON.stringify({ __metadata__: { model } }), "utf8");
  const prefix = Buffer.alloc(8);
  prefix.writeBigUInt64LE(BigInt(header.length));
  return Buffer.concat([prefix, header, Buffer.from([0])]);
}

function signedCallback(requestId: string): {
  body: string;
  headers: FalWebhookHeaders;
  publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"];
} {
  const body = JSON.stringify({
    request_id: requestId,
    status: "OK",
    payload: {
      diffusers_lora_file: {
        url: "https://v3.fal.media/files/weights.safetensors",
        content_type: "application/octet-stream",
      },
      config_file: {
        url: "https://v3.fal.media/files/config.json",
        content_type: "application/json",
      },
    },
  });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const userId = "r1-e2e-fixture-user";
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = `${requestId}\n${userId}\n${CALLBACK_TIME_SECONDS}\n${bodyHash}`;
  return {
    body,
    publicKey,
    headers: {
      requestId,
      userId,
      timestamp: String(CALLBACK_TIME_SECONDS),
      signature: encodeFalWebhookSignature(sign(null, Buffer.from(message), privateKey)),
    },
  };
}

function providerEvidence(
  entries: Array<{
    provider: string;
    endpoint: string;
    model: string;
    pricingVersion: string;
    outcome: string;
    latencyMs: number;
    estimatedCostUsd: number;
    actualCostUsd: number | null;
    requestId: string;
    id: string;
  }>,
): R1ProviderE2EEvidence[] {
  return entries.map((entry, index) => ({
    requestId: entry.requestId || `deterministic-attempt-${index}-${entry.id}`,
    evidenceSource: "deterministic",
    provider: entry.provider.toLowerCase().includes("anthropic") ? "anthropic" : "fal",
    endpoint: entry.endpoint,
    model: entry.model,
    pricingVersion: entry.pricingVersion,
    status: entry.outcome === "succeeded" ? "succeeded" : "failed",
    durationMs: Math.max(0, entry.latencyMs),
    actualCostUsd: entry.actualCostUsd ?? entry.estimatedCostUsd,
    redactedLog: `Deterministic ${entry.provider} ${entry.outcome} attempt`,
  }));
}

/**
 * Runs the accepted R1 journey through the real service graph over one stateful,
 * deterministic fixture. It deliberately produces deterministic provenance, so
 * it can prove wiring/recovery but can never unlock a production release.
 */
export function createDeterministicR1ProviderE2EComposition(): R1ProviderE2EComposition {
  return {
    async run() {
      const fal = new R1HarnessFal();
      const ctx = createTestContext({ fal });
      const stage = new Map<string, R1ProviderE2EStageEvidence>();
      const pass = (
        stageId: string,
        summary: string,
        details?: R1ProviderE2EStageEvidence["details"],
      ) => stage.set(stageId, { stageId, status: "passed", summary, details });

      const guardian = ctx.onboarding.ensureFamilyForNewUser(
        "auth-r1-e2e-family-a",
        "guardian-a@example.test",
      );
      const trial = ctx.subscriptions.activateTrial(guardian.familyId);
      assertStage(ctx.subscriptions.isActive(guardian.familyId), "trial was not active");
      pass("trial", "A server-authoritative seven-day trial was activated", {
        active: true,
        hasExpiry: trial.trialEndsAt instanceof Date,
      });

      const consent = ctx.subscriptions.recordConsent(
        guardian.familyId,
        guardian.id,
        "US",
      );
      assertStage(consent.familyId === guardian.familyId, "consent was not Family-linked");
      pass("consent", "A valid Family-linked consent receipt was recorded", {
        familyLinked: true,
        jurisdiction: consent.jurisdiction,
      });

      ctx.babies.addBaby({ memberId: guardian.id, displayName: "Maya" });
      ctx.babies.addBaby({ memberId: guardian.id, displayName: "Noor" });
      assertStage(ctx.store.getMembersByFamily(guardian.familyId).length === 1, "R1 roster gained another Member");
      assertStage(
        [...ctx.store.babies.values()].filter((baby) => baby.familyId === guardian.familyId).length === 2,
        "multiple Baby records were not persisted",
      );
      pass("family-roster", "One Guardian and multiple Baby records share one Family", {
        guardians: 1,
        babies: 2,
      });

      const babyPersona = await ctx.rawPersonas.createBaby({
        memberId: guardian.id,
        displayName: "Maya",
        photos: [goodPhoto(0x11), goodPhoto(0x12), goodPhoto(0x13)],
      });
      ctx.liveness.shouldMatch = true;
      const adultPersona = await ctx.rawPersonas.createAdult({
        memberId: guardian.id,
        displayName: "Guardian",
        photos: [goodPhoto(0x21), goodPhoto(0x22), goodPhoto(0x23)],
        selfie: Buffer.from("synthetic-consenting-adult-selfie"),
      });
      assertStage(fal.trainCalls === 2, "every Persona did not cross the training boundary once");
      assertStage(
        [babyPersona, adultPersona].every((persona) => persona.status === "ready" && persona.loraWeightKey),
        "trained Personas were not ready with LoRAs",
      );
      pass("train", "Both selected Personas completed training with owned LoRA references", {
        selectedPersonas: 2,
        trainingCalls: fal.trainCalls,
      });

      ctx.rawPersonas.acceptLikeness(babyPersona.id, guardian.id);
      ctx.rawPersonas.acceptLikeness(adultPersona.id, guardian.id);
      assertStage(
        [babyPersona.id, adultPersona.id].every(
          (id) => ctx.store.personas.get(id)?.likenessConfirmed === true,
        ),
        "likeness acceptance was not persisted",
      );
      pass("review-accept", "The Guardian reviewed and accepted both trained likenesses", {
        acceptedPersonas: 2,
      });

      const brief = {
        starringPersonaIds: [babyPersona.id, adultPersona.id],
        storyType: "bedtime" as const,
        theme: "A moonlit garden",
      };
      ctx.coldStart.submitBriefWhileTraining(guardian.id, babyPersona.id, brief);
      const pendingBefore = [...ctx.store.pendingBriefs.values()][0];
      assertStage(pendingBefore?.status === "pending", "waiting Brief was not durably pending");
      await ctx.coldStart.onPersonaReady(babyPersona.id);
      const acceptedBrief = [...ctx.store.pendingBriefs.values()][0];
      assertStage(
        acceptedBrief?.status === "accepted" && Boolean(acceptedBrief.storybookId),
        "waiting Brief was not claimed exactly once",
      );
      pass("brief", "A waiting Brief was durably claimed and linked to one Storybook", {
        pendingPersisted: true,
        accepted: true,
      });

      await ctx.workflow.drain();
      const validBookId = acceptedBrief.storybookId!;
      const validBook = ctx.store.storybooks.get(validBookId);
      const validPages = ctx.store.getPagesForStorybook(validBookId);
      assertStage(validBook?.status === "draft", "valid Story did not become a draft");
      assertStage(ctx.store.getPersistedGeneration(validBookId)?.story.pages.length === 12, "Story text was not exactly 12 Pages");
      pass("valid-story", "A semantically valid exact 12-Page Story was persisted", {
        storyStatus: validBook.status,
        pageCount: 12,
      });
      assertStage(validPages.length === 12, "Page fan-out did not persist 12 Page jobs");
      pass("twelve-page-jobs", "The Story fanned out exactly 12 Page jobs", {
        pageJobs: validPages.length,
      });
      assertStage(validPages.every((page) => page.text.trim().length > 0), "draft was not text-readable");
      pass("readable-draft", "The draft retained readable text for every Page", {
        readablePages: validPages.filter((page) => page.text.trim().length > 0).length,
      });

      const validRequests = fal.pageRequests.filter(
        (request) => request.seedMetadata.storybookId === validBookId,
      );
      assertStage(validRequests.length === 12, "captured Page requests did not match fan-out");
      assertStage(
        validRequests.every(
          (request) =>
            request.personaIds.length === 2 &&
            request.loras.length === 2 &&
            request.personaIds.every((id) => Boolean(request.styleBible.wardrobe[id])) &&
            request.seedMetadata.algorithm === "storybook-page-seed-v1" &&
            request.provider.length > 0 &&
            request.model.length > 0 &&
            request.endpoint.length > 0,
        ),
        "two-Persona request lost likeness, wardrobe, route, or deterministic seed",
      );
      pass("two-persona-scene", "Every Scene carried two distinct owned LoRAs and complete Style Bible data", {
        selectedPersonas: 2,
        ownedLorasPerPage: 2,
        requestsChecked: validRequests.length,
      });

      const originalResponse = structuredClone(ctx.anthropic.response);
      ctx.anthropic.response = { ...ctx.anthropic.response, text: "", pages: [], scenes: [] };
      const imagesBeforeTextFailure = fal.imageCalls;
      const failedTextBook = await ctx.storybooks.generate(guardian.id, {
        ...brief,
        theme: "Forced invalid text",
      });
      try {
        await ctx.workflow.drain();
      } catch {
        // Expected: the service records terminal failure and releases allowance.
      }
      ctx.anthropic.response = originalResponse;
      const textFailureReservation = ctx.store.storyAllowanceReservations.get(failedTextBook.id);
      assertStage(ctx.store.storybooks.get(failedTextBook.id)?.status === "failed", "text failure was not terminal");
      assertStage(textFailureReservation?.status === "released", "text failure did not release allowance");
      assertStage(fal.imageCalls === imagesBeforeTextFailure, "text failure reached image generation");
      pass("forced-text-failure", "Invalid Story text failed before image spend and released allowance", {
        storyStatus: "failed",
        allowanceReleased: 1,
        imageCalls: fal.imageCalls - imagesBeforeTextFailure,
      });

      fal.failPages.add(4);
      const pageFailureBook = await ctx.storybooks.generate(guardian.id, {
        ...brief,
        theme: "One recoverable Page hole",
      });
      await ctx.workflow.drain();
      fal.failPages.delete(4);
      const pageFailurePages = ctx.store.getPagesForStorybook(pageFailureBook.id);
      const failedPage = pageFailurePages.find((page) => page.generationStatus === "failed");
      assertStage(ctx.store.storybooks.get(pageFailureBook.id)?.status === "draft", "Page failure destroyed readable draft");
      assertStage(pageFailurePages.length === 12 && Boolean(failedPage), "Page failure was not isolated to a recoverable hole");
      assertStage(
        ctx.store.storyAllowanceReservations.get(pageFailureBook.id)?.status === "committed",
        "valid text allowance was not committed",
      );
      pass("page-failure", "One Page failed while the readable draft and committed allowance survived", {
        storyStatus: "draft",
        failedPages: pageFailurePages.filter((page) => page.generationStatus === "failed").length,
        allowanceCommitted: true,
      });

      const allowanceBeforeRepair = [...ctx.store.storyAllowanceReservations.values()].filter(
        (reservation) => reservation.status === "reserved" || reservation.status === "committed",
      ).length;
      await ctx.blobs.put(
        `books/${guardian.familyId}/${pageFailureBook.id}/page-${failedPage!.index}.png.attempt-0.raw`,
        Buffer.from("owned-failed-page-artifact"),
      );
      fal.failRepairs = true;
      ctx.storybooks.recoverPage(guardian.id, failedPage!.id);
      await ctx.workflow.drain();
      fal.failRepairs = false;
      const allowanceAfterRepair = [...ctx.store.storyAllowanceReservations.values()].filter(
        (reservation) => reservation.status === "reserved" || reservation.status === "committed",
      ).length;
      assertStage(fal.repairRequests.length === 2, "bounded repair did not execute both tiers");
      assertStage(ctx.store.pages.get(failedPage!.id)?.generationStatus === "failed", "repair failure was hidden");
      assertStage(allowanceAfterRepair === allowanceBeforeRepair, "Page repair charged Story allowance again");
      pass("repair-failure", "Both bounded repair tiers failed visibly without another Story charge", {
        pageStatus: "failed",
        repairAttempts: fal.repairRequests.length,
        allowanceDelta: allowanceAfterRepair - allowanceBeforeRepair,
      });

      const callbackRequestId = "deterministic-training-callback-185";
      const callbackNow = new Date(CALLBACK_TIME_SECONDS * 1000);
      ctx.store.falTrainingRequests.set(callbackRequestId, {
        requestId: callbackRequestId,
        familyId: guardian.familyId,
        personaId: babyPersona.id,
        endpoint: "fal-ai/flux-2-trainer-v2",
        model: "flux-2-lora-v2",
        steps: 300,
        idempotencyKey: "r1-e2e-callback",
        status: "queued",
        createdAt: callbackNow,
        updatedAt: callbackNow,
      });
      const callback = signedCallback(callbackRequestId);
      const verifier = createFalWebhookVerifier({
        now: () => CALLBACK_TIME_SECONDS,
        resolvePublicKeys: async () => [callback.publicKey],
      });
      const webhook = new FalTrainingWebhookService(
        new DataStoreFalTrainingLifecycleRepository(ctx.store, () => callbackNow),
        ctx.blobs,
        verifier,
        () => callbackNow,
      );
      const downloads: string[] = [];
      const download = async (url: string) => {
        downloads.push(url);
        return url.endsWith("config.json")
          ? {
              bytes: Buffer.from(JSON.stringify({ architecture: "flux-2-lora-v2" })),
              contentType: "application/json",
              finalUrl: url,
            }
          : {
              bytes: makeSafetensorsArtifact("flux-2-lora-v2"),
              contentType: "application/octet-stream",
              finalUrl: url,
            };
      };
      const costBeforeCallback = ctx.store.providerCostLedgerEntries.size;
      const firstCallback = await webhook.handle(callback.headers, callback.body, download);
      const duplicateCallback = await webhook.handle(callback.headers, callback.body, download);
      const costAfterCallback = ctx.store.providerCostLedgerEntries.size;
      assertStage(!firstCallback.duplicate && duplicateCallback.duplicate, "signed callback replay was not idempotent");
      assertStage(downloads.length === 2, "callback replay downloaded artifacts twice");
      assertStage(costBeforeCallback === costAfterCallback, "callback replay changed provider cost ledger");
      pass("duplicate-callback", "A signed fresh callback was durably claimed once and replayed safely", {
        duplicateAccepted: duplicateCallback.accepted && duplicateCallback.duplicate,
        artifactDownloads: downloads.length,
        costLedgerDelta: costAfterCallback - costBeforeCallback,
      });

      const otherGuardian = ctx.onboarding.ensureFamilyForNewUser(
        "auth-r1-e2e-family-b",
        "guardian-b@example.test",
      );
      let denied = false;
      try {
        ctx.store.getStorybook(validBookId, otherGuardian.id);
      } catch (error) {
        denied = error instanceof RlsViolationError;
      }
      assertStage(denied, "Family B read Family A Storybook");
      pass("rls-cross-family-denial", "Authenticated Family B was denied Family A Storybook access", {
        denied,
      });

      const allowanceRows = [...ctx.store.storyAllowanceReservations.values()].filter(
        (reservation) => reservation.familyId === guardian.familyId,
      );
      const allowance = {
        allowed: 4,
        reserved: allowanceRows.filter((row) => row.status === "reserved").length,
        released: allowanceRows.filter((row) => row.status === "released").length,
        committed: allowanceRows.filter((row) => row.status === "committed").length,
        remaining: 4 - allowanceRows.filter(
          (row) => row.status === "reserved" || row.status === "committed",
        ).length,
      };
      assertStage(
        allowance.reserved === 0 && allowance.released === 1 && allowance.committed === 2 && allowance.remaining === 2,
        "fixture-derived allowance accounting did not match R1 semantics",
      );

      const costEntries = [...ctx.store.providerCostLedgerEntries.values()].filter(
        (entry) => entry.owningEntityIds.familyId === guardian.familyId,
      );
      const evidence = providerEvidence(costEntries);
      assertStage(evidence.length > 3, "executed provider boundaries did not produce evidence");

      const providerArtifactDeletes: string[] = [];
      const deletion = await new HardDeleteService(
        ctx.store,
        ctx.blobs,
        ctx.notifications,
        {
          deleteArtifact: async (key) => {
            providerArtifactDeletes.push(key);
          },
        },
      ).hardDelete(guardian.id);
      const deletedFamilyDataRemaining = ctx.store.familyDataExists(guardian.familyId);
      const otherFamilyDataRemaining = ctx.store.familyDataExists(otherGuardian.familyId);
      const deletedAllInventoriedRows = Object.entries(deletion.inventory).every(([key, count]) => {
        if (["sourcePhotos", "reviewSamples", "avatars", "loraArtifacts"].includes(key)) return true;
        return deletion.deleted.database[key] === count;
      });
      const deletedAllOwnedBlobs = (
        await Promise.all(deletion.deleted.blobKeys.map((key) => ctx.blobs.get(key)))
      ).every((value) => value == null);
      assertStage(!deletedFamilyDataRemaining, "Hard-delete left Family A rows");
      assertStage(deletedAllInventoriedRows, "Hard-delete did not remove every inventoried database row");
      assertStage(deletedAllOwnedBlobs, "Hard-delete left an inventoried Family blob");
      assertStage(deletion.provider.limitations.length === 0, "Hard-delete left a provider deletion limitation");
      assertStage(
        providerArtifactDeletes.length >= 2 &&
          providerArtifactDeletes.length === deletion.deleted.providerArtifacts.length,
        "Hard-delete did not remove every tracked provider artifact",
      );
      assertStage(otherFamilyDataRemaining, "Hard-delete crossed into Family B");
      pass("hard-delete", "Hard-delete erased all inventoried Family A rows, blobs, and provider artifacts while preserving Family B", {
        deletedFamilyDataRemaining,
        deletedDatabaseRows: Object.values(deletion.deleted.database).reduce((sum, count) => sum + count, 0),
        deletedBlobKeys: deletion.deleted.blobKeys.length,
        deletedProviderArtifacts: providerArtifactDeletes.length,
        otherFamilyDataRemaining,
      });

      const stageEvidence = R1_PROVIDER_E2E_FLOW_PLAN.map((item) => stage.get(item.id));
      assertStage(stageEvidence.every(Boolean), "one or more accepted stages lacked executed evidence");
      return {
        evidenceSource: "deterministic" as const,
        stageEvidence: stageEvidence as R1ProviderE2EStageEvidence[],
        evidence,
        storyAllowanceAccounting: allowance,
        redactedLogs: [
          "Deterministic stateful composition completed; no production credentials or raw media retained in evidence",
        ],
        reservedUsd: 0,
      };
    },
  };
}
