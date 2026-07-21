import { describe, expect, it } from "vitest";
import { FakeFal, InMemoryBlobStore } from "@/adapters/fakes";
import { DataStore } from "@/db/store";
import {
  FalLoraTrainingService,
  buildTrainingZip,
  inspectTrainingZip,
} from "@/services/fal-lora-training";
import { FLUX_2_TRAINER_ENDPOINT } from "@/services/provider-bakeoff";

function setup() {
  const store = new DataStore();
  const blobs = new InMemoryBlobStore();
  const fal = new FakeFal();
  const service = new FalLoraTrainingService(store, fal, blobs, {
    endpoint: FLUX_2_TRAINER_ENDPOINT,
    model: "flux-2-lora-v2",
    steps: 300,
  });
  return { store, blobs, fal, service };
}

describe("179 — real FLUX LoRA ZIP submission contract", () => {
  it("builds one ZIP URL containing only moderated images and valid per-image/default captions", async () => {
    const zip = buildTrainingZip([
      { filename: "one.jpg", bytes: Buffer.from("one"), moderated: true, caption: "subject smiling" },
      { filename: "two.jpg", bytes: Buffer.from("two"), moderated: true },
      { filename: "unsafe.jpg", bytes: Buffer.from("unsafe"), moderated: false, caption: "unsafe" },
    ], "a portrait of subject");

    const entries = inspectTrainingZip(zip);
    expect(entries.filter((entry) => entry.filename.endsWith(".jpg")).map((entry) => entry.filename)).toEqual([
      "one.jpg",
      "two.jpg",
    ]);
    expect(entries.find((entry) => entry.filename === "one.txt")?.text).toBe("subject smiling");
    expect(entries.find((entry) => entry.filename === "two.txt")?.text).toBe("a portrait of subject");
    expect(entries.some((entry) => entry.filename.includes("unsafe"))).toBe(false);

    const { service, fal, store } = setup();
    const submission = await service.submit({
      familyId: "family-1",
      personaId: "persona-1",
      images: [
        { filename: "one.jpg", bytes: Buffer.from("one"), moderated: true, caption: "subject smiling" },
        { filename: "two.jpg", bytes: Buffer.from("two"), moderated: true },
        { filename: "unsafe.jpg", bytes: Buffer.from("unsafe"), moderated: false },
      ],
      defaultCaption: "a portrait of subject",
      idempotencyKey: "train/family-1/persona-1/v1",
    });

    expect(fal.trainingSubmissions).toHaveLength(1);
    expect(fal.trainingSubmissions[0]?.imageDataUrl).toMatch(/^memory:\/\/training-inputs\//);
    expect(fal.trainingSubmissions[0]?.imageDataUrl).not.toContain("unsafe");
    expect(submission.requestId).toBe("job-1");
    expect(store.falTrainingRequests.get("job-1")).toMatchObject({
      familyId: "family-1",
      personaId: "persona-1",
      model: "flux-2-lora-v2",
      endpoint: FLUX_2_TRAINER_ENDPOINT,
      steps: 300,
      idempotencyKey: "train/family-1/persona-1/v1",
    });
  });

  it("uses the canary routing record and persists request/model/step/idempotency metadata", async () => {
    const { service, fal, store } = setup();
    const result = await service.submit({
      familyId: "family-2",
      personaId: "persona-2",
      images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
      defaultCaption: "subject",
      idempotencyKey: "idempotency-2",
      routingDecision: { endpoint: "canary/custom-endpoint", model: "canary-model", steps: 500 },
    });

    expect(fal.trainingSubmissions[0]).toMatchObject({
      endpoint: "canary/custom-endpoint",
      model: "canary-model",
      steps: 500,
      idempotencyKey: "idempotency-2",
    });
    expect(store.falTrainingRequests.get(result.requestId)).toMatchObject({
      requestId: result.requestId,
      endpoint: "canary/custom-endpoint",
      model: "canary-model",
      steps: 500,
      idempotencyKey: "idempotency-2",
    });
  });

  it("validates both provider result files and copies them to Family-owned keys, never using temporary URLs as keys", async () => {
    const { service, store, blobs } = setup();
    const submitted = await service.submit({
      familyId: "family-3",
      personaId: "persona-3",
      images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
      defaultCaption: "subject",
      idempotencyKey: "idempotency-3",
    });

    await service.handleResult({
      requestId: submitted.requestId,
      status: "OK",
      payload: {
        diffusers_lora_file: { url: "https://fal.media/tmp/weights.safetensors", content_type: "application/octet-stream" },
        config_file: { url: "https://fal.media/tmp/config.json", content_type: "application/json" },
      },
    }, async (url) => Buffer.from(url.endsWith("config.json") ? "{\"rank\":16}" : "weights"));

    const request = store.falTrainingRequests.get(submitted.requestId)!;
    expect(request.status).toBe("ready");
    expect(request.loraWeightKey).toBe("lora/family-3/persona-3/weights.safetensors");
    expect(request.configurationKey).toBe("lora/family-3/persona-3/config.json");
    expect(request.loraWeightKey).not.toContain("fal.media");
    expect(request.configurationKey).not.toContain("fal.media");
    expect(await blobs.get(request.loraWeightKey!)).toEqual(Buffer.from("weights"));
    expect(await blobs.get(request.configurationKey!)).toEqual(Buffer.from('{"rank":16}'));
  });

  it("records a durable failed state with an observable redacted error", async () => {
    const { service, store } = setup();
    const submitted = await service.submit({
      familyId: "family-4",
      personaId: "persona-4",
      images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
      defaultCaption: "subject",
      idempotencyKey: "idempotency-4",
    });

    await service.handleResult({
      requestId: submitted.requestId,
      status: "ERROR",
      error: "provider failed with secret=do-not-store and authorization: bearer top-secret",
    });

    const request = store.falTrainingRequests.get(submitted.requestId)!;
    expect(request.status).toBe("failed");
    expect(request.error).toMatch(/provider failed/i);
    expect(request.error).not.toContain("top-secret");
    expect(request.error).not.toContain("do-not-store");
  });

  it("marks local fakes as development-only and refuses them as release evidence", () => {
    const { fal, service } = setup();
    expect(fal.isDevOnly).toBe(true);
    expect(service.canSatisfyReleaseEvidence()).toBe(false);
  });

  it("keeps provider credentials backend-only: submission metadata and client projection contain no secret", async () => {
    const { service, store, fal } = setup();
    const result = await service.submit({
      familyId: "family-5",
      personaId: "persona-5",
      images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
      defaultCaption: "subject",
      idempotencyKey: "idempotency-5",
    });

    const metadata = JSON.stringify(store.falTrainingRequests.get(result.requestId));
    const client = JSON.stringify(service.toClientStatus(result.requestId));
    expect(metadata).not.toContain("FAL_API_KEY");
    expect(metadata).not.toContain("fal-test-secret");
    expect(client).not.toContain("FAL_API_KEY");
    expect(client).not.toContain("fal-test-secret");
    expect(JSON.stringify(fal.trainingSubmissions[0])).not.toContain("fal-test-secret");
  });
});
