import type {
  FalAdapter,
  FalGenerateImageOptions,
  FalImageResult,
  FalTrainResult,
} from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

// DECISION: call fal.ai's queue REST API directly with fetch rather than the
// @fal-ai/client SDK — the surface we need (submit, poll, fetch bytes) is
// small, and a hand-rolled client keeps the idempotency-key handling explicit.
const FAL_QUEUE_BASE = "https://queue.fal.run";

// Flux LoRA endpoints (ADR-0002: per-persona Flux LoRA).
const TRAIN_ENDPOINT = "fal-ai/flux-lora-fast-training";
const INFER_ENDPOINT = "fal-ai/flux-lora";
const INPAINT_ENDPOINT = "fal-ai/flux-lora/inpainting";
// ADR-0005 fallback: reference-image multimodal model for multi-Persona Pages.
const REFERENCE_MODEL_ENDPOINT = "fal-ai/gemini-25-flash-image/edit";

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
  async startTraining(photos: Buffer[]): Promise<FalTrainResult> {
    // Training photos travel as data URIs; fal zips them server-side.
    const webhookUrl = optionalEnv("FAL_WEBHOOK_URL");
    const submitUrl = new URL(`${FAL_QUEUE_BASE}/${TRAIN_ENDPOINT}`);
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
    return this.runInference(INFER_ENDPOINT, {
      prompt,
      loras: [{ path: loraKey, scale: 1 }],
      image_size: "square_hd",
      num_images: 1,
      enable_safety_checker: true, // ADR-0010: provider filters stay ON
    }, options?.idempotencyKey);
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
      lastResult = await this.runInference(INPAINT_ENDPOINT, {
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
    return this.runInference(REFERENCE_MODEL_ENDPOINT, {
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
    return { imageUrl, bytes };
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
