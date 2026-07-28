import { createHash } from "node:crypto";
import type { BlobStore } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { FalWebhookHeaders } from "@/adapters/fal-webhook";
import { createFalWebhookVerifier } from "@/adapters/fal-webhook";
import {
  asFalTrainingLifecycleRepository,
  type FalTrainingLifecycleRepository,
} from "@/db/fal-training-lifecycle";
import {
  copyValidatedTrainingArtifacts,
  FalArtifactValidationError,
  redactProviderError,
  type ArtifactDownloader,
  type FalProviderResult,
} from "@/services/fal-lora-training";

export type FalWebhookVerifier = ReturnType<typeof createFalWebhookVerifier>;
export type { ArtifactDownloader } from "@/services/fal-lora-training";

export class FalTrainingWebhookService {
  private readonly repository: FalTrainingLifecycleRepository;

  constructor(
    persistence: DataStore | FalTrainingLifecycleRepository,
    private readonly blobs: BlobStore,
    private readonly verifier: FalWebhookVerifier,
    private readonly now: () => Date = () => new Date(),
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
        await this.repository.completeCallback({
          requestId: result.requestId,
          fingerprint,
          status: "failed",
          error: redactProviderError(result.error ?? "fal training failed"),
        });
        return { accepted: true, duplicate: false };
      }

      const owned = await copyValidatedTrainingArtifacts(claim.request, result, this.blobs, download);
      await this.repository.completeCallback({
        requestId: result.requestId,
        fingerprint,
        status: "ready",
        loraWeightKey: owned.loraWeightKey,
        configurationKey: owned.configurationKey,
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
