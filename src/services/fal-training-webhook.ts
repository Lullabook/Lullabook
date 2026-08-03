import { createHash } from "node:crypto";
import type { BlobStore, FalAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { FalWebhookHeaders } from "@/adapters/fal-webhook";
import { createFalWebhookVerifier } from "@/adapters/fal-webhook";
import {
  asFalTrainingLifecycleRepository,
  type FalTrainingLifecycleRepository,
} from "@/db/fal-training-lifecycle";
import { likenessReviewSampleBlobKey } from "@/lib/roster-avatar";
import {
  copyValidatedTrainingArtifacts,
  FalArtifactValidationError,
  redactProviderError,
  type ArtifactDownloader,
  type FalProviderResult,
} from "@/services/fal-lora-training";

export type FalWebhookVerifier = ReturnType<typeof createFalWebhookVerifier>;
export type { ArtifactDownloader } from "@/services/fal-lora-training";

/**
 * Generates the Family-owned likeness-review samples a signed successful
 * training callback persists with the `training -> review` transition. Sample
 * generation is idempotent per training request (deterministic idempotency
 * keys and generation IDs), so a lease-reclaimed callback retry regenerates
 * the same keys instead of accumulating orphan samples.
 */
export interface PersonaReviewSampleGenerator {
  generate(
    request: { requestId: string; familyId: string; personaId: string },
    loraWeightKey: string,
  ): Promise<string[]>;
}

export class FalReviewSampleGenerator implements PersonaReviewSampleGenerator {
  constructor(
    private readonly fal: FalAdapter,
    private readonly blobs: BlobStore,
    private readonly sampleCount = 2,
  ) {}

  async generate(
    request: { requestId: string; familyId: string; personaId: string },
    loraWeightKey: string,
  ): Promise<string[]> {
    const generationId = createHash("sha256").update(request.requestId).digest("hex").slice(0, 16);
    // `loraWeightKey` is an internal Family-owned blob key. fal needs a
    // temporary provider-readable URL; passing the key itself makes real
    // review-sample generation fail after the callback has already copied the
    // trained artifacts.
    const loraUrl = await this.blobs.signedUrl(loraWeightKey);
    const keys: string[] = [];
    try {
      for (let index = 0; index < this.sampleCount; index++) {
        const key = likenessReviewSampleBlobKey(request.familyId, request.personaId, generationId, index);
        const image = await this.fal.generateImage(
          `Likeness review sample ${index + 1}: a gentle storybook scene, no raw photo`,
          loraUrl,
          { idempotencyKey: `likeness-sample/${request.personaId}/${request.requestId}/${index}` },
        );
        await this.blobs.put(key, image.bytes ?? Buffer.from("likeness-review-sample"));
        keys.push(key);
      }
      return keys;
    } catch (error) {
      // A partial review set must never become a persisted likeness surface.
      await Promise.allSettled(keys.map((key) => this.blobs.delete(key)));
      throw error;
    }
  }
}

export class FalTrainingWebhookService {
  private readonly repository: FalTrainingLifecycleRepository;

  constructor(
    persistence: DataStore | FalTrainingLifecycleRepository,
    private readonly blobs: BlobStore,
    private readonly verifier: FalWebhookVerifier,
    private readonly now: () => Date = () => new Date(),
    private readonly sampleGenerator?: PersonaReviewSampleGenerator,
  ) {
    this.repository = asFalTrainingLifecycleRepository(persistence, this.now);
  }

  async handle(
    headers: FalWebhookHeaders,
    rawBody: string,
    download: ArtifactDownloader = async () => { throw new Error("Artifact downloader is required"); },
  ): Promise<{ accepted: true; duplicate: boolean }> {
    await this.verifier.verify(headers, rawBody);

    let parsed: { request_id?: string; status?: string; payload?: FalProviderResult["payload"]; error?: string };
    try {
      parsed = JSON.parse(rawBody) as typeof parsed;
    } catch {
      throw new Error("Malformed fal webhook JSON");
    }
    const result: FalProviderResult = {
      requestId: parsed.request_id ?? "",
      status: parsed.status as FalProviderResult["status"],
      payload: parsed.payload,
      error: parsed.error,
    };
    if (!result.requestId || !["OK", "ERROR", "IN_PROGRESS"].includes(result.status)) {
      throw new Error("Malformed fal webhook result");
    }
    if (result.requestId !== headers.requestId) {
      throw new Error("Fal webhook request ID does not match the signed header");
    }
    if (
      result.status === "OK" &&
      (!result.payload?.diffusers_lora_file?.url || !result.payload?.config_file?.url)
    ) {
      throw new Error("Malformed fal training result: missing LoRA/configuration artifact");
    }

    const fingerprint = createHash("sha256")
      .update(`${result.requestId}\n${rawBody}`)
      .digest("hex");
    const claim = await this.repository.claimCallback(result.requestId, fingerprint);
    if (claim.duplicate) return { accepted: true, duplicate: true };

    try {
      if (claim.request.status === "ready" || claim.request.status === "failed") {
        // Stale or out-of-order callback: acknowledge without copying artifacts
        // or moving the Persona (the SQL completion only transitions `training`).
        await this.repository.completeCallback({
          requestId: result.requestId,
          fingerprint,
          status: claim.request.status,
          loraWeightKey: claim.request.loraWeightKey,
          configurationKey: claim.request.configurationKey,
          error: claim.request.error,
        });
        return { accepted: true, duplicate: false };
      }
      if (result.status === "IN_PROGRESS") {
        await this.repository.completeCallback({
          requestId: result.requestId,
          fingerprint,
          status: "running",
        });
        return { accepted: true, duplicate: false };
      }
      if (result.status === "ERROR") {
        // A real training failure marks the Persona `failed` with a redacted
        // terminal reason and consumes no Storybook allowance.
        await this.repository.completeCallback({
          requestId: result.requestId,
          fingerprint,
          status: "failed",
          error: redactProviderError(result.error ?? "fal training failed"),
        });
        return { accepted: true, duplicate: false };
      }

      const owned = await copyValidatedTrainingArtifacts(claim.request, result, this.blobs, download);
      const sampleKeys = this.sampleGenerator
        ? await this.sampleGenerator.generate(claim.request, owned.loraWeightKey)
        : [];
      // The completion transaction durably persists `training -> review` with
      // the Family-owned LoRA key and review samples for the correct Persona.
      await this.repository.completeCallback({
        requestId: result.requestId,
        fingerprint,
        status: "ready",
        loraWeightKey: owned.loraWeightKey,
        configurationKey: owned.configurationKey,
        reviewSampleKeys: sampleKeys,
      });
      return { accepted: true, duplicate: false };
    } catch (error) {
      if (error instanceof FalArtifactValidationError) {
        await this.repository.completeCallback({
          requestId: result.requestId,
          fingerprint,
          status: "failed",
          error: redactProviderError(error),
        });
      } else {
        await this.repository.releaseCallback(result.requestId, fingerprint);
      }
      throw error;
    }
  }
}
