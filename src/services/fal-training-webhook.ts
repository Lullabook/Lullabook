import { createHash } from "node:crypto";
import type { BlobStore, FalAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { FalWebhookHeaders } from "@/adapters/fal-webhook";
import { createFalWebhookVerifier } from "@/adapters/fal-webhook";
import { FalLoraTrainingService, type FalProviderResult } from "@/services/fal-lora-training";

export type FalWebhookVerifier = ReturnType<typeof createFalWebhookVerifier>;
export type ArtifactDownloader = (url: string) => Promise<Buffer>;

export class FalTrainingWebhookService {
  constructor(
    private readonly store: DataStore,
    private readonly blobs: BlobStore,
    private readonly verifier: FalWebhookVerifier,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async handle(
    headers: FalWebhookHeaders,
    rawBody: string,
    download: ArtifactDownloader = async () => { throw new Error("Artifact downloader is required"); },
  ): Promise<{ accepted: true; duplicate: boolean }> {
    // The raw body is authenticated before JSON parsing. This is important:
    // malformed business data must not become an unauthenticated oracle.
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
    if (!result.requestId || !["OK", "ERROR", "IN_PROGRESS"].includes(result.status)) throw new Error("Malformed fal webhook result");
    // A success without both artifacts is a malformed result, not a success —
    // reject it before it can consume an idempotency slot or touch any
    // request state (including a terminal one it must never overwrite).
    if (
      result.status === "OK" &&
      (!result.payload?.diffusers_lora_file?.url || !result.payload?.config_file?.url)
    ) {
      throw new Error("Malformed fal training result: missing diffusers_lora_file/config_file artifact");
    }
    const fingerprint = createHash("sha256").update(`${result.requestId}\n${rawBody}`).digest("hex");
    if (this.store.falWebhookReceipts.has(fingerprint)) return { accepted: true, duplicate: true };
    const request = this.store.falTrainingRequests.get(result.requestId);
    if (!request) throw new Error("Unknown fal training request");

    // A terminal request can absorb a late progress event, but a terminal
    // success cannot be overwritten by a later failure or malformed success.
    if (request.status === "ready" || request.status === "failed") {
      if (result.status === "IN_PROGRESS" || result.status === "ERROR") {
        this.store.falWebhookReceipts.set(fingerprint, { requestId: result.requestId, fingerprint, receivedAt: this.now() });
        return { accepted: true, duplicate: false };
      }
    }

    const training = new FalLoraTrainingService(this.store, undefined as unknown as FalAdapter, this.blobs, undefined, this.now);
    await training.handleResult(result, download);
    this.store.falWebhookReceipts.set(fingerprint, { requestId: result.requestId, fingerprint, receivedAt: this.now() });
    return { accepted: true, duplicate: false };
  }
}
