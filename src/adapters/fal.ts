import type {
  FalAdapter,
  FalGenerateImageOptions,
  FalImageResult,
  FalPageImageRequest,
  FalPageRepairRequest,
  FalTrainResult,
  FalTrainingStatusQuery,
  FalTrainingStatusResult,
  FalTrainingSubmission,
} from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

// DECISION: call fal.ai's queue REST API directly with fetch rather than the
// @fal-ai/client SDK — the surface we need (submit, poll, fetch bytes) is
// small, and a hand-rolled client keeps the idempotency-key handling explicit.
const FAL_QUEUE_BASE = "https://queue.fal.run";

// Canonical fal routes are exported so canaries and cost evidence compare
// against the production boundary rather than copied expected metadata.
export const FAL_FLUX_1_TRAIN_ENDPOINT = "fal-ai/flux-lora-fast-training";
export const FAL_FLUX_1_LORA_ENDPOINT = "fal-ai/flux-lora";
export const FAL_FLUX_1_LORA_MODEL = "flux-1-lora";
export const FAL_FLUX_1_INPAINT_ENDPOINT = "fal-ai/flux-lora/inpainting";
export const FAL_FLUX_2_TRAINER_ENDPOINT = "fal-ai/flux-2-trainer-v2";
export const FAL_FLUX_2_LORA_ENDPOINT = "fal-ai/flux-2/lora";
export const FAL_NANO_BANANA_2_EDIT_ENDPOINT = "fal-ai/nano-banana-2/edit";
// ADR-0005 fallback: reference-image multimodal model for multi-Persona Pages.
export const FAL_REFERENCE_MODEL_ENDPOINT = "fal-ai/gemini-25-flash-image/edit";

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

interface FalQueueSubmitResponse {
  request_id: string;
  status_url: string;
  response_url: string;
}

interface FalImageOutput {
  images?: { url: string }[];
  image?: { url: string };
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Key ${requireEnv("FAL_API_KEY")}`,
    "Content-Type": "application/json",
  };
}

/**
 * A fal queue URL we are willing to fetch. Status/response URLs can arrive from
 * persisted provider data, so the origin is pinned to fal's queue host before
 * any request leaves the process.
 */
function trustedFalQueueUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("fal queue URL is invalid");
  }
  const trustedHost = url.hostname === "queue.fal.run" || url.hostname.endsWith(".fal.run");
  if (url.protocol !== "https:" || !trustedHost || url.username || url.password) {
    throw new Error("fal queue URL is not a trusted fal origin");
  }
  return url.toString();
}

async function falFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`fal.ai request failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return res;
}

/**
 * Real fal.ai adapter: queue-submit + sync-await for inference (PRD v2 —
 * inference is awaited inside its durable step; training stays webhook +
 * waitForEvent and is enqueued with a webhook URL here).
 */
export class RealFalAdapter implements FalAdapter {
  readonly isDevOnly = false;

  async submitTraining(input: FalTrainingSubmission): Promise<FalTrainResult> {
    const submitUrl = new URL(`${FAL_QUEUE_BASE}/${input.endpoint}`);
    const webhookUrl = input.webhookUrl ?? optionalEnv("FAL_WEBHOOK_URL");
    if (webhookUrl) submitUrl.searchParams.set("fal_webhook", webhookUrl);
    const headers = authHeaders();
    headers["X-Fal-Idempotency-Key"] = input.idempotencyKey;
    const res = await falFetch(submitUrl.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        image_data_url: input.imageDataUrl,
        default_caption: input.defaultCaption,
        model: input.model,
        steps: input.steps,
      }),
    });
    const queued = (await res.json()) as FalQueueSubmitResponse;
    // Ticket 208 / FAIL-4: retain the queue status URL so reconciliation can
    // poll the exact entry fal created rather than depend on the callback.
    return {
      jobId: queued.request_id,
      status: "queued",
      ...(queued.status_url ? { statusUrl: queued.status_url } : {}),
    };
  }

  /**
   * Ticket 208 / FAIL-4 — GET the fal queue status for one training request and
   * normalise it into the same shape a webhook body carries. A `COMPLETED`
   * entry is resolved through its response URL so the caller receives the real
   * artifacts; a failed/cancelled entry becomes a terminal ERROR. Only fal's
   * queue origin is ever contacted — a persisted URL pointing anywhere else is
   * rejected rather than fetched (no SSRF through a stored provider value).
   */
  async fetchTrainingStatus(query: FalTrainingStatusQuery): Promise<FalTrainingStatusResult> {
    const statusUrl = trustedFalQueueUrl(
      query.statusUrl ?? `${FAL_QUEUE_BASE}/${query.endpoint}/requests/${query.requestId}/status`,
    );
    const headers = { Authorization: `Key ${requireEnv("FAL_API_KEY")}` };
    const statusRes = await falFetch(statusUrl, { headers });
    const status = (await statusRes.json()) as {
      status?: string;
      response_url?: string;
      error?: string;
      detail?: string;
    };
    const state = (status.status ?? "").toUpperCase();
    if (state === "IN_QUEUE" || state === "IN_PROGRESS") {
      return { requestId: query.requestId, status: "IN_PROGRESS" };
    }
    if (state === "FAILED" || state === "CANCELLED" || state === "ERROR") {
      return {
        requestId: query.requestId,
        status: "ERROR",
        error: status.error ?? status.detail ?? `fal training ${state.toLowerCase()}`,
      };
    }
    if (state !== "COMPLETED" && state !== "OK") {
      return {
        requestId: query.requestId,
        status: "ERROR",
        error: `fal queue reported an unknown status (${state || "missing"})`,
      };
    }
    const responseUrl = trustedFalQueueUrl(
      status.response_url ?? `${FAL_QUEUE_BASE}/${query.endpoint}/requests/${query.requestId}`,
    );
    const resultRes = await falFetch(responseUrl, { headers });
    const payload = (await resultRes.json()) as FalTrainingStatusResult["payload"] & {
      error?: string;
      detail?: string;
    };
    if (!payload?.diffusers_lora_file?.url || !payload?.config_file?.url) {
      return {
        requestId: query.requestId,
        status: "ERROR",
        error:
          payload?.error ??
          payload?.detail ??
          "fal training completed without LoRA/configuration artifacts",
      };
    }
    return {
      requestId: query.requestId,
      status: "OK",
      payload: {
        diffusers_lora_file: payload.diffusers_lora_file,
        config_file: payload.config_file,
      },
    };
  }

  async startTraining(photos: Buffer[]): Promise<FalTrainResult> {
    // Training photos travel as data URIs; fal zips them server-side.
    const webhookUrl = optionalEnv("FAL_WEBHOOK_URL");
    const submitUrl = new URL(`${FAL_QUEUE_BASE}/${FAL_FLUX_1_TRAIN_ENDPOINT}`);
    if (webhookUrl) submitUrl.searchParams.set("fal_webhook", webhookUrl);

    const res = await falFetch(submitUrl.toString(), {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        images_data_url: photos.map(
          (p) => `data:image/jpeg;base64,${p.toString("base64")}`
        ),
        trigger_word: "subject",
      }),
    });
    const queued = (await res.json()) as FalQueueSubmitResponse;
    return { jobId: queued.request_id, status: "queued" };
  }

  async generateImage(
    prompt: string,
    loraKey: string,
    options?: FalGenerateImageOptions
  ): Promise<FalImageResult> {
    return this.runInference(FAL_FLUX_1_LORA_ENDPOINT, {
      prompt,
      loras: [{ path: loraKey, scale: 1 }],
      image_size: "square_hd",
      num_images: 1,
      enable_safety_checker: true, // ADR-0010: provider filters stay ON
    }, options?.idempotencyKey);
  }

  async generatePageImage(input: FalPageImageRequest): Promise<FalImageResult> {
    return this.runInference(
      input.endpoint,
      {
        prompt: input.prompt,
        loras: input.loras.map(({ path, scale }) => ({ path, scale })),
        seed: input.seed,
        model: input.model,
        enable_safety_checker: input.safety.enabled,
        num_images: 1,
        image_size: "square_hd",
      },
      input.idempotencyKey
    );
  }

  async repairPageImage(input: FalPageRepairRequest): Promise<FalImageResult> {
    return this.runInference(
      input.endpoint,
      {
        prompt: input.prompt,
        // The failed page is the edit canvas. Identity inputs remain separate
        // guidance, and selected LoRAs are retained on every repair tier.
        image_url: input.failedPageImageUrl,
        image_urls: input.identityReferenceImageUrls,
        loras: input.loras.map(({ path, scale }) => ({ path, scale })),
        seed: input.seed,
        model: input.model,
        enable_safety_checker: input.safety.enabled,
        num_images: 1,
        image_size: "square_hd",
      },
      input.idempotencyKey
    );
  }

  async inpaintFaces(
    baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult> {
    // ADR-0005: sequential per-face inpaint — one LoRA-conditioned inpaint
    // pass per face region, each consuming the previous pass's output.
    let currentUrl = baseImageUrl;
    let lastResult: FalImageResult | null = null;
    for (const face of faces) {
      lastResult = await this.runInference(FAL_FLUX_1_INPAINT_ENDPOINT, {
        prompt: `the face in the ${face.region} region, photorealistic likeness`,
        image_url: currentUrl,
        loras: [{ path: face.loraKey, scale: 1 }],
        enable_safety_checker: true,
      });
      currentUrl = lastResult.imageUrl;
    }
    if (!lastResult) throw new Error("inpaintFaces called with no faces");
    return lastResult;
  }

  async generateWithReferenceModel(
    prompt: string,
    referenceImageUrls: string[]
  ): Promise<FalImageResult> {
    return this.runInference(FAL_REFERENCE_MODEL_ENDPOINT, {
      prompt,
      image_urls: referenceImageUrls,
    });
  }

  /**
   * Submit to the fal queue and await the result synchronously (the durable
   * step is the retry boundary). The deterministic idempotency key derived
   * from {storybookId}/{pageIndex}/{attempt} is forwarded so a workflow
   * replay never bills a second inference for the same Page attempt.
   */
  private async runInference(
    endpoint: string,
    body: Record<string, unknown>,
    idempotencyKey?: string
  ): Promise<FalImageResult> {
    const headers = authHeaders();
    if (idempotencyKey) {
      headers["X-Fal-Idempotency-Key"] = idempotencyKey;
    }

    const res = await falFetch(`${FAL_QUEUE_BASE}/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const queued = (await res.json()) as FalQueueSubmitResponse;

    const result = await this.pollForResult(queued);
    const imageUrl =
      result.images?.[0]?.url ??
      result.image?.url ??
      null;
    if (!imageUrl) {
      throw new Error("fal.ai inference returned no image");
    }

    // Fetch the bytes immediately: the fal URL is ephemeral, and moderation
    // must run on bytes before any persist (ADR-0010).
    const imageRes = await falFetch(imageUrl);
    const bytes = Buffer.from(await imageRes.arrayBuffer());
    return {
      imageUrl,
      bytes,
      providerRequestId: queued.request_id,
      contentType: imageRes.headers.get("content-type")?.split(";", 1)[0]?.trim(),
    };
  }

  private async pollForResult(queued: FalQueueSubmitResponse): Promise<FalImageOutput> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const headers = { Authorization: `Key ${requireEnv("FAL_API_KEY")}` };

    while (Date.now() < deadline) {
      const statusRes = await falFetch(queued.status_url, { headers });
      const status = (await statusRes.json()) as { status: string };
      if (status.status === "COMPLETED") {
        const resultRes = await falFetch(queued.response_url, { headers });
        return (await resultRes.json()) as FalImageOutput;
      }
      if (status.status === "FAILED" || status.status === "CANCELLED") {
        throw new Error(`fal.ai inference ${status.status.toLowerCase()}`);
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error("fal.ai inference timed out");
  }
}
