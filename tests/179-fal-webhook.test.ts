import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import {
  createFalWebhookVerifier,
  encodeFalWebhookSignature,
  type FalWebhookHeaders,
} from "@/adapters/fal-webhook";
import { DataStore } from "@/db/store";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import { FalTrainingWebhookService } from "@/services/fal-training-webhook";

const body = JSON.stringify({
  request_id: "request-1",
  status: "OK",
  payload: {
    diffusers_lora_file: { url: "https://fal.media/weights.safetensors", content_type: "application/octet-stream" },
    config_file: { url: "https://fal.media/config.json", content_type: "application/json" },
  },
});

function signedRequest(rawBody = body, timestamp = Math.floor(Date.now() / 1000)) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const requestId = "webhook-request-id";
  const userId = "family-1";
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = `${requestId}\n${userId}\n${timestamp}\n${bodyHash}`;
  const signature = sign(null, Buffer.from(message), privateKey);
  const headers: FalWebhookHeaders = {
    requestId,
    userId,
    timestamp: String(timestamp),
    signature: encodeFalWebhookSignature(signature),
  };
  return { headers, publicKey, message };
}

describe("179 — fal webhook verification and idempotent lifecycle", () => {
  afterEach(() => vi.restoreAllMocks());

  it("checks freshness and body hash and verifies ED25519 before parsing business data", async () => {
    const order: string[] = [];
    const { headers, publicKey } = signedRequest("not-json");
    const verifier = createFalWebhookVerifier({
      now: () => Number(headers.timestamp),
      resolvePublicKeys: async () => {
        order.push("keys");
        return [publicKey];
      },
      onBodyHash: () => order.push("body-hash"),
    });
    const service = new FalTrainingWebhookService(new DataStore(), new InMemoryBlobStore(), verifier);

    await expect(service.handle(headers, "not-json")).rejects.toThrow(/signature|body hash/i);
    expect(order).toEqual(["body-hash"]);

    const stale = signedRequest(body, 1);
    const staleVerifier = createFalWebhookVerifier({ now: () => 1000, resolvePublicKeys: async () => [stale.publicKey] });
    await expect(new FalTrainingWebhookService(new DataStore(), new InMemoryBlobStore(), staleVerifier).handle(stale.headers, body)).rejects.toThrow(/timestamp|stale/i);

    const malformedButUnsigned = { ...headers, signature: "v1,not-a-signature" };
    await expect(service.handle(malformedButUnsigned, "{\"request_id\":")).rejects.toThrow(/signature|public key/i);
  });

  it("rejects an invalid signature without parsing or advancing a request", async () => {
    const { headers, publicKey } = signedRequest();
    const invalid = { ...headers, signature: encodeFalWebhookSignature(Buffer.alloc(64, 7)) };
    const store = new DataStore();
    store.falTrainingRequests.set("request-1", {
      requestId: "request-1", familyId: "family-1", personaId: "persona-1", endpoint: "e", model: "m", steps: 300,
      idempotencyKey: "i", status: "queued", createdAt: new Date(), updatedAt: new Date(),
    });
    const verifier = createFalWebhookVerifier({ now: () => Number(headers.timestamp), resolvePublicKeys: async () => [publicKey] });
    const service = new FalTrainingWebhookService(store, new InMemoryBlobStore(), verifier);

    await expect(service.handle(invalid, body)).rejects.toThrow(/signature/i);
    expect(store.falTrainingRequests.get("request-1")?.status).toBe("queued");
  });

  it("handles duplicate success callbacks once and never double-copies artifacts", async () => {
    const { headers, publicKey } = signedRequest(body);
    const store = new DataStore();
    store.falTrainingRequests.set("request-1", {
      requestId: "request-1", familyId: "family-1", personaId: "persona-1", endpoint: "e", model: "m", steps: 300,
      idempotencyKey: "i", status: "queued", createdAt: new Date(), updatedAt: new Date(),
    });
    const blobs = new InMemoryBlobStore();
    const verifier = createFalWebhookVerifier({ now: () => Number(headers.timestamp), resolvePublicKeys: async () => [publicKey] });
    const service = new FalTrainingWebhookService(store, blobs, verifier);
    const downloads: string[] = [];
    const fetchArtifact = vi.fn(async (url: string) => { downloads.push(url); return Buffer.from(url); });

    expect(await service.handle(headers, body, fetchArtifact)).toMatchObject({ accepted: true, duplicate: false });
    const second = await service.handle(headers, body, fetchArtifact);
    expect(second).toMatchObject({ accepted: true, duplicate: true });
    expect(downloads).toHaveLength(2);
    expect(store.falTrainingRequests.get("request-1")?.status).toBe("ready");
    expect(store.falWebhookReceipts.size).toBe(1);
  });

  it("records provider failure durably, redacts secrets, and never spends a second time on duplicates", async () => {
    const failedBody = JSON.stringify({ request_id: "request-f", status: "ERROR", error: "secret=provider-token upstream timeout" });
    const { headers, publicKey } = signedRequest(failedBody);
    const store = new DataStore();
    store.falTrainingRequests.set("request-f", {
      requestId: "request-f", familyId: "family-f", personaId: "persona-f", endpoint: "e", model: "m", steps: 300,
      idempotencyKey: "training/f", status: "queued", createdAt: new Date(), updatedAt: new Date(),
    });
    const verifier = createFalWebhookVerifier({ now: () => Number(headers.timestamp), resolvePublicKeys: async () => [publicKey] });
    const service = new FalTrainingWebhookService(store, new InMemoryBlobStore(), verifier);

    await expect(service.handle(headers, failedBody)).resolves.toMatchObject({ accepted: true });
    await expect(service.handle(headers, failedBody)).resolves.toMatchObject({ duplicate: true });
    const request = store.falTrainingRequests.get("request-f")!;
    expect(request.status).toBe("failed");
    expect(request.error).toMatch(/upstream timeout/);
    expect(request.error).not.toContain("provider-token");
  });

  it("ignores stale, malformed, and out-of-order callbacks without incorrect state transitions", async () => {
    const { headers, publicKey } = signedRequest(body);
    const store = new DataStore();
    store.falTrainingRequests.set("request-1", {
      requestId: "request-1", familyId: "family-1", personaId: "persona-1", endpoint: "e", model: "m", steps: 300,
      idempotencyKey: "i", status: "ready", loraWeightKey: "lora/family-1/persona-1/weights.safetensors", configurationKey: "lora/family-1/persona-1/config.json", createdAt: new Date(), updatedAt: new Date(),
    });

    // Each signedRequest() mints its own keypair; the JWKS seam publishes
    // several active keys at once, so the verifier resolves all of them.
    const inProgress = JSON.stringify({ request_id: "request-1", status: "IN_PROGRESS" });
    const progress = signedRequest(inProgress, Number(headers.timestamp));
    const malformedResult = JSON.stringify({ request_id: "request-1", status: "OK", payload: {} });
    const malformed = signedRequest(malformedResult, Number(headers.timestamp));
    const verifier = createFalWebhookVerifier({
      now: () => Number(headers.timestamp),
      resolvePublicKeys: async () => [publicKey, progress.publicKey, malformed.publicKey],
    });
    const service = new FalTrainingWebhookService(store, new InMemoryBlobStore(), verifier);

    await expect(service.handle(progress.headers, inProgress)).resolves.toMatchObject({ accepted: true });
    expect(store.falTrainingRequests.get("request-1")?.status).toBe("ready");

    await expect(service.handle(malformed.headers, malformedResult)).rejects.toThrow(/result|artifact|config/i);
    expect(store.falTrainingRequests.get("request-1")?.status).toBe("ready");

    const stale = signedRequest(inProgress, Number(headers.timestamp) - 301);
    const staleVerifier = createFalWebhookVerifier({ now: () => Number(headers.timestamp), resolvePublicKeys: async () => [stale.publicKey] });
    await expect(new FalTrainingWebhookService(store, new InMemoryBlobStore(), staleVerifier).handle(stale.headers, inProgress)).rejects.toThrow(/timestamp|stale/i);
  });

  it("does not expose verifier keys or backend credentials through the callback contract", () => {
    const { headers } = signedRequest();
    expect(JSON.stringify(headers)).not.toContain("FAL_API_KEY");
    expect(JSON.stringify(headers)).not.toContain("secret");
  });
});
