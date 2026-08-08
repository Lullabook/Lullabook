import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import type { FalAdapter } from "@/adapters/types";
import { encodeFalWebhookSignature, type FalWebhookHeaders } from "@/adapters/fal-webhook";
import type { Persona } from "@/domain/types";
import { DataStore } from "@/db/store";
import type { FalWebhookVerifier } from "@/services/fal-training-webhook";
import { FalTrainingWebhookService, type PersonaReviewSampleGenerator } from "@/services/fal-training-webhook";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import { LiveFalSpendCapService } from "@/services/live-fal-spend-cap";
import { CallbackReachabilityPreflight } from "@/services/callback-reachability";
import { FalJwksService, LIVE_FAL_RUN_APPROVED_ENV } from "@/services/fal-jwks";
import { FLUX_2_TRAINER_ENDPOINT } from "@/services/provider-bakeoff";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";

/**
 * Issue 205 — the live half of local issue 179: submit training to the real
 * fal.ai queue endpoint from moderated images only, persist the request
 * identifier, and verify the callback against fal's live JWKS public keys before
 * any business data is parsed.
 *
 * Acceptance covered here: SEC-4 (callback rejected before business parsing
 * unless timestamp + body hash + signature verify against fal's JWKS keys — the
 * JWKS HTTP endpoint is faked, never the network), FAIL-5 (duplicate / stale /
 * out-of-order callbacks leave state and spend unchanged), LAT-6 (a verified
 * callback advances the Persona on a bounded, injected-clock path), and FAIL-3
 * (fal 4xx / 5xx / timeout / malformed artifact drive a durable failed state with
 * a redacted reason and no orphaned owned blob).
 *
 * The live-provider opt-in (`LIVE_PROVIDER_RUN_APPROVED=true`) gates the live
 * JWKS fetch; ticket 208 separately proves the real (non-injected) live fetch.
 */

const flux2 = {
  endpoint: FLUX_2_TRAINER_ENDPOINT,
  model: "flux-2-lora-v2",
  steps: 300,
};

const ORIGIN = "https://lullabook.vercel.app";
const NOW_SECONDS = 1_800_000_000;

/** A fake JWKS HTTP endpoint serving the given Ed25519 JWK keys. */
function fakeJwksFetch(keys: Record<string, unknown>[]): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

function ed25519Jwk(publicKey: KeyObject): Record<string, unknown> {
  return publicKey.export({ format: "jwk" }) as unknown as Record<string, unknown>;
}

/** A real (non dev-only) fal adapter so the live boundary is exercised. */
function liveFal(failSubmit = false): { fal: FalAdapter; calls: () => number } {
  let calls = 0;
  const fal: FalAdapter = {
    isDevOnly: false,
    async startTraining() {
      calls++;
      return { jobId: `job-${calls}`, status: "queued" };
    },
    async submitTraining() {
      calls++;
      if (failSubmit) throw new Error("fal.ai 503 Service Unavailable");
      return { jobId: `job-${calls}`, status: "queued" };
    },
    async generateImage() {
      throw new Error("not used");
    },
    async inpaintFaces() {
      throw new Error("not used");
    },
    async generateWithReferenceModel() {
      throw new Error("not used");
    },
  };
  return { fal, calls: () => calls };
}

/** Signs `rawBody` over fal's canonical message with a fresh ephemeral ED25519 key. */
function signedHeaders(rawBody: string, timestamp = NOW_SECONDS) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  let requestId = "request-1";
  try {
    const parsed = JSON.parse(rawBody) as { request_id?: string };
    requestId = parsed.request_id ?? requestId;
  } catch {
    // Structural-invalid bodies still use the expected provider request header.
  }
  const userId = "fal-user-1";
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = `${requestId}\n${userId}\n${timestamp}\n${bodyHash}`;
  const signature = sign(null, Buffer.from(message), privateKey);
  return {
    publicKey,
    jwk: ed25519Jwk(publicKey),
    headers: {
      requestId,
      userId,
      timestamp: String(timestamp),
      signature: encodeFalWebhookSignature(signature),
    } satisfies FalWebhookHeaders,
  };
}

function successBody(requestId: string, overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    request_id: requestId,
    status: "OK",
    payload: {
      diffusers_lora_file: {
        url: "https://fal.media/files/weights.safetensors",
        content_type: "application/octet-stream",
      },
      config_file: {
        url: "https://fal.media/files/config.json",
        content_type: "application/json",
      },
    },
    ...overrides,
  });
}

function seedPersona(store: DataStore, id: string, overrides: Partial<Persona> = {}): Persona {
  const persona: Persona = {
    id,
    familyId: "family-1",
    createdByMemberId: "member-1",
    kind: "baby",
    displayName: "Maya",
    status: "training",
    loraWeightKey: null,
    avatarKey: null,
    reviewSampleKeys: [],
    likenessConfirmed: false,
    createdAt: new Date(),
    ...overrides,
  };
  store.personas.set(id, persona);
  return persona;
}

function seedTrainingRequest(store: DataStore, requestId: string, personaId: string, overrides: Record<string, unknown> = {}) {
  store.falTrainingRequests.set(requestId, {
    requestId,
    familyId: "family-1",
    personaId,
    endpoint: flux2.endpoint,
    model: flux2.model,
    steps: 300,
    idempotencyKey: "i",
    status: "queued",
    loraWeightKey: null,
    configurationKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as never);
}

const artifactDownload = () =>
  async (url: string) =>
    url.includes("config")
      ? { bytes: Buffer.from(JSON.stringify({ architecture: flux2.model })), contentType: "application/json", finalUrl: url }
      : { bytes: makeTestSafetensorsArtifact({ model: flux2.model }), contentType: "application/octet-stream", finalUrl: url };

/** Submission path: live fal + spend cap + callback preflight (issues 203/204 FIRST). */
function bootstrapSubmission(opts: { failSubmit?: boolean } = {}) {
  const store = new DataStore();
  const blobs = new InMemoryBlobStore();
  const { fal, calls } = liveFal(opts.failSubmit);
  const cap = new LiveFalSpendCapService(store, { liveRunApproved: "true" });
  const train = new FalLoraTrainingService(
    store,
    fal,
    blobs,
    flux2,
    () => new Date("2026-08-06T00:00:00Z"),
    undefined,
    cap,
    new CallbackReachabilityPreflight({ callbackBaseUrl: ORIGIN }),
  );
  return { store, blobs, fal, calls, cap, train };
}

/** Webhook path: a {@link FalJwksService} whose fake JWKS endpoint serves exactly
 * `jwk` (the key that signed the body under test), driving a
 * {@link FalTrainingWebhookService}. Never touches the network. */
function bootstrapWebhook(
  jwk: Record<string, unknown>,
  opts: { timestamp?: number; sampleGenerator?: PersonaReviewSampleGenerator } = {},
) {
  const store = new DataStore();
  const blobs = new InMemoryBlobStore();
  const timestamp = opts.timestamp ?? NOW_SECONDS;
  const jwksFetch = fakeJwksFetch([jwk]);
  const jwks = new FalJwksService({
    now: () => timestamp,
    liveRunApproved: "true",
    fetchImpl: jwksFetch as unknown as typeof fetch,
  });
  const service = new FalTrainingWebhookService(
    store,
    blobs,
    jwks as unknown as FalWebhookVerifier,
    () => new Date(timestamp * 1000),
    opts.sampleGenerator,
  );
  return { store, blobs, jwks, jwksFetch, service, timestamp };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("205 — submission uploads ONE zip of moderated images + captions and persists request id/model/steps", () => {
  it("uploads exactly one zip containing only moderated images plus captions", async () => {
    const { blobs, train, calls } = bootstrapSubmission();

    const result = await train.submit({
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

    expect(result.requestId).toBe("job-1");
    expect(result.status).toBe("queued");
    expect(calls()).toBe(1);

    const zipKeys = await blobs.list("training-inputs/");
    expect(zipKeys).toHaveLength(1);

    const { inspectTrainingZip } = await import("@/services/fal-lora-training");
    const entries = inspectTrainingZip((await blobs.get(zipKeys[0]!))!);
    expect(entries.filter((e) => e.filename.endsWith(".jpg")).map((e) => e.filename)).toEqual(["one.jpg", "two.jpg"]);
    expect(entries.find((e) => e.filename === "one.txt")?.text).toBe("subject smiling");
    expect(entries.find((e) => e.filename === "two.txt")?.text).toBe("a portrait of subject");
    expect(entries.some((e) => e.filename.includes("unsafe"))).toBe(false);
  });

  it("persists the fal.ai request id, model, and step count", async () => {
    const { store, train } = bootstrapSubmission();
    await train.submit({
      familyId: "family-1",
      personaId: "persona-1",
      images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
      defaultCaption: "subject",
      idempotencyKey: "train/family-1/persona-1/v1",
    });
    expect(store.falTrainingRequests.get("job-1")).toMatchObject({
      requestId: "job-1",
      familyId: "family-1",
      personaId: "persona-1",
      endpoint: flux2.endpoint,
      model: flux2.model,
      steps: flux2.steps,
      idempotencyKey: "train/family-1/persona-1/v1",
      status: "queued",
    });
  });

  it("replays an idempotent submission without a second provider call or a second zip", async () => {
    const { blobs, train, calls } = bootstrapSubmission();
    const input = {
      familyId: "family-1",
      personaId: "persona-2",
      images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
      defaultCaption: "subject",
      idempotencyKey: "train/family-1/persona-2/v1",
    };
    const first = await train.submit(input);
    const second = await train.submit(input);
    expect(second.requestId).toBe(first.requestId);
    expect(calls()).toBe(1);
    expect(await blobs.list("training-inputs/")).toHaveLength(1);
  });
});

describe("205 — SEC-4: callbacks rejected before business parsing unless verified against fal JWKS", () => {
  it("verifies timestamp + body hash + signature against keys served by the fal JWKS endpoint", async () => {
    const body = successBody("request-sec4");
    const signed = signedHeaders(body);
    const { store, service, jwksFetch } = bootstrapWebhook(signed.jwk);
    seedPersona(store, "persona-sec4");
    seedTrainingRequest(store, "request-sec4", "persona-sec4");

    const result = await service.handle(signed.headers, body, artifactDownload());
    expect(result).toMatchObject({ accepted: true, duplicate: false });
    // The verifier really did resolve keys from the (fake) JWKS HTTP endpoint:
    // proof the callback was checked against fal's published keys, not a bypass.
    expect(jwksFetch).toHaveBeenCalled();

    // Same body, same JWKS-served key, but a stale timestamp -> rejected and
    // never claimed (would have parsed no business data).
    const staleBody = successBody("request-sec4");
    const stale = signedHeaders(staleBody, NOW_SECONDS - 301);
    const staleCtx = bootstrapWebhook(stale.jwk, { timestamp: NOW_SECONDS });
    seedPersona(staleCtx.store, "persona-sec4");
    seedTrainingRequest(staleCtx.store, "request-sec4", "persona-sec4");
    await expect(staleCtx.service.handle(stale.headers, staleBody)).rejects.toThrow(/timestamp|stale/i);
    expect(staleCtx.store.falWebhookReceipts.size).toBe(0); // never claimed
  });

  it("rejects an untrusted signature before any business parse or state advance", async () => {
    const body = successBody("request-bad");
    const valid = signedHeaders(body);
    const { store, service } = bootstrapWebhook(valid.jwk);
    seedPersona(store, "persona-bad");
    seedTrainingRequest(store, "request-bad", "persona-bad");

    // Valid timestamp + body against the served key, but signature bytes are
    // not produced by any key the JWKS endpoint serves.
    const forged = { ...valid.headers, signature: encodeFalWebhookSignature(Buffer.alloc(64, 7)) };

    await expect(service.handle(forged, body)).rejects.toThrow(/signature/i);
    expect(store.falWebhookReceipts.size).toBe(0); // no claim was made
    expect(store.falTrainingRequests.get("request-bad")).toMatchObject({ status: "queued" });
    expect(store.personas.get("persona-bad")).toMatchObject({ status: "training" });
  });

  it("fails closed on the live JWKS fetch when the live-provider opt-in is absent", async () => {
    const body = successBody("request-x");
    const signed = signedHeaders(body);
    const fetchImpl = fakeJwksFetch([signed.jwk]);
    const jwks = new FalJwksService({ now: () => NOW_SECONDS, fetchImpl: fetchImpl as unknown as typeof fetch });
    delete (process.env as Record<string, string>)[LIVE_FAL_RUN_APPROVED_ENV];
    expect(jwks.liveApproved()).toBe(false);
    await expect(jwks.verify(signed.headers, body)).rejects.toThrow(/LIVE_PROVIDER_RUN_APPROVED/);
    expect(fetchImpl).not.toHaveBeenCalled(); // no live key fetch without opt-in
  });
});

describe("205 — FAIL-5: duplicate, stale, out-of-order callbacks leave state and spend unchanged", () => {
  it("a duplicate success callback does not double-copy artifacts or add spend", async () => {
    const body = successBody("request-dedup");
    const signed = signedHeaders(body);
    const { store, service } = bootstrapWebhook(signed.jwk);
    seedPersona(store, "persona-dedup");
    seedTrainingRequest(store, "request-dedup", "persona-dedup");

    const spy = vi.fn(artifactDownload());

    await service.handle(signed.headers, body, spy);
    const firstArtifactCalls = spy.mock.calls.length;
    expect(firstArtifactCalls).toBe(2);
    const receiptsAfterFirst = store.falWebhookReceipts.size;
    const spendBefore = [...store.providerCostLedgerEntries.values()].filter((e) => e.provider === "fal.ai").length;

    const second = await service.handle(signed.headers, body, spy);
    expect(second).toMatchObject({ accepted: true, duplicate: true });

    // No re-copy, no new receipt, no new spend ledger activity.
    expect(spy).toHaveBeenCalledTimes(firstArtifactCalls);
    expect(store.falWebhookReceipts.size).toBe(receiptsAfterFirst);
    expect([...store.providerCostLedgerEntries.values()].filter((e) => e.provider === "fal.ai")).toHaveLength(spendBefore);
    expect(store.falTrainingRequests.get("request-dedup")).toMatchObject({ status: "ready" });
    expect(store.personas.get("persona-dedup")).toMatchObject({ status: "review" });
  });

  it("an out-of-order in-progress callback after ready is acknowledged without copying or reverting", async () => {
    const body = JSON.stringify({ request_id: "request-ooo", status: "IN_PROGRESS" });
    const signed = signedHeaders(body);
    const { store, service } = bootstrapWebhook(signed.jwk);
    seedPersona(store, "persona-ooo", { status: "review" });
    seedTrainingRequest(store, "request-ooo", "persona-ooo", {
      status: "ready",
      loraWeightKey: "lora/family-1/persona-ooo/weights.safetensors",
      configurationKey: "lora/family-1/persona-ooo/config.json",
    });

    const download = vi.fn();
    const result = await service.handle(signed.headers, body, download);
    expect(result).toMatchObject({ accepted: true, duplicate: false });
    expect(download).not.toHaveBeenCalled();
    expect(store.falTrainingRequests.get("request-ooo")).toMatchObject({ status: "ready" });
    expect(store.personas.get("persona-ooo")).toMatchObject({ status: "review" });
  });
});

describe("205 — LAT-6: a verified callback advances the Persona on a bounded, injected-clock path", () => {
  it("transitions training -> review with Family-owned keys inside the 30s bound", async () => {
    const samples: PersonaReviewSampleGenerator = {
      async generate() {
        return ["likeness/family-1/persona-lat/sample-0"];
      },
    };
    const body = successBody("request-lat");
    const signed = signedHeaders(body);
    const { store, service } = bootstrapWebhook(signed.jwk, { sampleGenerator: samples });
    seedPersona(store, "persona-lat", { status: "training", loraWeightKey: null });
    seedTrainingRequest(store, "request-lat", "persona-lat");

    // Structural bound (LAT-6): a verified callback must advance the Persona
    // within 30 seconds of receipt. The transition is a single synchronous
    // completion off the injected clock, so bounding the wall-time of the
    // awaited handle() is the honest check — it resolves well under 30s.
    const startedAt = Date.now();
    await service.handle(signed.headers, body, artifactDownload());
    expect(Date.now() - startedAt).toBeLessThanOrEqual(30_000);

    const persona = store.personas.get("persona-lat");
    expect(persona!.status).toBe("review");
    expect(persona!.loraWeightKey).toBe("lora/family-1/persona-lat/weights.safetensors");
    expect(persona!.reviewSampleKeys).toEqual(["likeness/family-1/persona-lat/sample-0"]);
    expect(persona!.failureReason).toBeUndefined();
  });
});

describe("205 — diffusers_lora_file + configuration copied into Family-owned storage", () => {
  it("stores both artifacts under Family-owned keys and never a provider temp URL as an owned key", async () => {
    const body = successBody("request-own");
    const signed = signedHeaders(body);
    const { store, blobs, service } = bootstrapWebhook(signed.jwk);
    seedPersona(store, "persona-own");
    seedTrainingRequest(store, "request-own", "persona-own");

    await service.handle(signed.headers, body, artifactDownload());

    const request = store.falTrainingRequests.get("request-own")!;
    expect(request.status).toBe("ready");
    expect(request.loraWeightKey).toBe("lora/family-1/persona-own/weights.safetensors");
    expect(request.configurationKey).toBe("lora/family-1/persona-own/config.json");
    expect(request.loraWeightKey).not.toContain("fal.media");
    expect(request.configurationKey).not.toContain("fal.media");

    const owned = await blobs.list("lora/family-1/persona-own/");
    expect(owned).toContain(request.loraWeightKey);
    expect(owned).toContain(request.configurationKey);
    expect(owned.every((k) => !k.includes("fal.media"))).toBe(true);
    // The persisted persona references the Family-owned weight key, not a URL.
    expect(store.personas.get("persona-own")).toMatchObject({ loraWeightKey: request.loraWeightKey });
  });
});

describe("205 — FAIL-3: 4xx/5xx/timeout or malformed artifact → durable failed, no orphaned blob", () => {
  it("a 5xx submission fails closed and leaves no owned blob", async () => {
    const { store, blobs, train } = bootstrapSubmission({ failSubmit: true });
    const idempotencyKey = "train/family-1/persona-5xx/v1";
    await expect(
      train.submit({
        familyId: "family-1",
        personaId: "persona-5xx",
        images: [{ filename: "one.jpg", bytes: Buffer.from("one"), moderated: true }],
        defaultCaption: "subject",
        idempotencyKey,
      }),
    ).rejects.toThrow(/503|unavailable/i);
    // No owned LoRA/config blob was ever written; the reservation was released
    // to a terminal `failed` row (never left holding against the ceiling).
    expect(await blobs.list("lora/family-1/persona-5xx/")).toEqual([]);
    expect(
      [...store.providerCostLedgerEntries.values()].filter(
        (e) => e.provider === "fal.ai" && e.requestId === idempotencyKey,
      ).map((e) => e.outcome),
    ).toEqual(["failed"]);
  });

  it("a 4xx provider ERROR drives the Persona to failed with a redacted reason", async () => {
    const body = JSON.stringify({
      request_id: "request-4xx",
      status: "ERROR",
      error: "fal.ai 400 rate limited api_key=top-secret",
    });
    const signed = signedHeaders(body);
    const { store, service } = bootstrapWebhook(signed.jwk);
    seedPersona(store, "persona-4xx");
    seedTrainingRequest(store, "request-4xx", "persona-4xx");

    await service.handle(signed.headers, body);

    expect(store.falTrainingRequests.get("request-4xx")).toMatchObject({ status: "failed" });
    const persona = store.personas.get("persona-4xx");
    expect(persona!.status).toBe("failed");
    expect(persona!.failureReason).toMatch(/rate limited/);
    expect(JSON.stringify(persona!.failureReason)).not.toContain("top-secret");
  });

  it("a malformed artifact yields a durable failed state and leaves no orphaned owned blob", async () => {
    const body = successBody("request-mal");
    const signed = signedHeaders(body);
    const { store, blobs, service } = bootstrapWebhook(signed.jwk);
    seedPersona(store, "persona-mal");
    seedTrainingRequest(store, "request-mal", "persona-mal");

    const badDownload = vi.fn(async (url: string) =>
      url.includes("config")
        ? { bytes: Buffer.from("not-json"), contentType: "application/json", finalUrl: url }
        : { bytes: Buffer.alloc(4), contentType: "application/octet-stream", finalUrl: url },
    );

    await expect(service.handle(signed.headers, body, badDownload)).rejects.toThrow(/artifact|truncated|json/i);

    const persona = store.personas.get("persona-mal");
    expect(persona!.status).toBe("failed");
    expect(persona!.failureReason).toMatch(/artifact|configuration|truncated/i);
    expect(await blobs.list("lora/family-1/persona-mal/")).toEqual([]);
  });
});