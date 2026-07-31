import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealFalAdapter } from "@/adapters/fal";
import type { FalPageRepairRequest } from "@/adapters/types";

function repairRequest(): FalPageRepairRequest {
  return {
    pageIndex: 3,
    prompt: "watercolor family picnic",
    loras: [
      { personaId: "persona-a", path: "lora/family/persona-a/weights.safetensors", scale: 1 },
      { personaId: "persona-b", path: "lora/family/persona-b/weights.safetensors", scale: 1 },
    ],
    personaIds: ["persona-a", "persona-b"],
    styleBible: {
      artStyle: "warm watercolor",
      palette: "peach and blue",
      wardrobe: { "persona-a": "blue cardigan", "persona-b": "yellow coat" },
    },
    seed: 42,
    seedMetadata: { storybookId: "book-182", pageIndex: 3, algorithm: "storybook-page-seed-v1" },
    provider: "fal.ai",
    endpoint: "fal-ai/nano-banana-2/edit",
    model: "Nano Banana 2 Edit",
    modelVersion: "nano-banana-2-edit-v1",
    safety: { enabled: true },
    idempotencyKey: "book-182/3/1/fal-generate",
    tier: "nano-banana-2-edit",
    failedPageImageUrl: "https://signed.example/books/family/book-182/page-3.attempt-0.raw",
    identityReferenceImageUrls: [
      "https://signed.example/personas/a/sample.png",
      "https://signed.example/personas/b/sample.png",
    ],
  };
}

describe("182 — fal request contract", () => {
  beforeEach(() => vi.stubEnv("FAL_API_KEY", "fal-test-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("preserves owned edit and identity inputs plus every selected LoRA at the real fal boundary", async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      const calls = fetch.mock.calls.length;
      if (calls === 1) {
        return new Response(JSON.stringify({
          request_id: "req-182",
          status_url: "https://queue.example/status",
          response_url: "https://queue.example/result",
        }));
      }
      if (calls === 2) return new Response(JSON.stringify({ status: "COMPLETED" }));
      if (calls === 3) return new Response(JSON.stringify({ images: [{ url: "https://fal.media/page.png" }] }));
      return new Response(Buffer.from("page-bytes"));
    });
    vi.stubGlobal("fetch", fetch);

    await new RealFalAdapter().repairPageImage(repairRequest());

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
    expect(body.image_url).toContain("books/family/book-182");
    expect(body.image_urls).toEqual([
      "https://signed.example/personas/a/sample.png",
      "https://signed.example/personas/b/sample.png",
    ]);
    expect(body.loras).toEqual([
      { path: "lora/family/persona-a/weights.safetensors", scale: 1 },
      { path: "lora/family/persona-b/weights.safetensors", scale: 1 },
    ]);
    expect(body.enable_safety_checker).toBe(true);
    expect(JSON.stringify(body)).not.toContain("example.com/ref");
  });
});
