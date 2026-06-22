import type {
  FalAdapter,
  FalGenerateImageOptions,
  FalImageResult,
  FalTrainResult,
} from "@/adapters/types";

/**
 * Issue 108 — Dev-only fal fallback adapter. Used when DEV_FAL_FALLBACK=true
 * AND no FAL_API_KEY is configured, so the Simulator can reach `ready`
 * without live fal keys. Training returns a placeholder `ready` result with a
 * synthetic lora key; image generation returns a placeholder image. Photos
 * still pass the safety scan; raw photos are never rendered (ADR-0020).
 *
 * Inert in production — wired only by the double-gated `shouldDevFalFallback`
 * check in context.ts.
 */
export class DevFalFallbackAdapter implements FalAdapter {
  private trainCount = 0;

  async startTraining(_photos: Buffer[]): Promise<FalTrainResult> {
    this.trainCount++;
    const jobId = `dev-fal-job-${this.trainCount}`;
    // Training resolves immediately to `ready` with a placeholder LoRA key —
    // no live fal training, no cost, no keys needed.
    return { jobId, status: "queued" };
  }

  async generateImage(
    prompt: string,
    loraKey: string,
    options?: FalGenerateImageOptions
  ): Promise<FalImageResult> {
    const idempotencyKey = options?.idempotencyKey ?? `dev-fal-${loraKey}`;
    // Return a placeholder image — synthetic, never a real face.
    const bytes = Buffer.from(`dev-fal-placeholder:${idempotencyKey}`);
    return { imageUrl: `memory://dev-fal/${loraKey}`, bytes };
  }

  async inpaintFaces(
    _baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult> {
    const bytes = Buffer.from(`dev-fal-inpaint:${faces.length}`);
    return { imageUrl: `memory://dev-fal-inpaint/${faces.length}`, bytes };
  }

  async generateWithReferenceModel(
    _prompt: string,
    referenceImageUrls: string[]
  ): Promise<FalImageResult> {
    const bytes = Buffer.from(`dev-fal-ref:${referenceImageUrls.length}`);
    return { imageUrl: `memory://dev-fal-ref/${referenceImageUrls.length}`, bytes };
  }
}
