import { createHash, generateKeyPairSync, sign } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import {
  createFalWebhookPublicKeyResolver,
  encodeFalWebhookSignature,
} from "@/adapters/fal-webhook";
import { RealFalAdapter } from "@/adapters/fal";
import { DataStore } from "@/db/store";
import { SupabaseDataStore } from "@/db/supabase-store";
import { createFalArtifactDownloader } from "@/services/fal-lora-training";
import { createFalWebhookPost } from "@/app/api/webhooks/fal/handler";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";

type Row = Record<string, unknown>;

function createStubSupabaseClient(
  tables: Record<string, Row[]>,
  recorded: { table: string; rows: Row[] }[],
): SupabaseClient {
  function makeQuery(table: string) {
    const filters: { kind: "eq" | "in"; column: string; value: unknown }[] = [];
    let deleting = false;

    function resolveRows(): Row[] {
      let rows = tables[table] ?? [];
      for (const filter of filters) {
        if (filter.kind === "eq") rows = rows.filter((row) => row[filter.column] === filter.value);
        if (filter.kind === "in") {
          rows = rows.filter((row) => (filter.value as unknown[]).includes(row[filter.column]));
        }
      }
      return rows;
    }

    const query = {
      select() { return query; },
      delete() { deleting = true; return query; },
      upsert(rows: Row | Row[]) {
        recorded.push({ table, rows: Array.isArray(rows) ? rows : [rows] });
        return Promise.resolve({ data: null, error: null });
      },
      eq(column: string, value: unknown) {
        filters.push({ kind: "eq", column, value });
        return query;
      },
      in(column: string, value: unknown[]) {
        if (deleting) return Promise.resolve({ data: null, error: null });
        filters.push({ kind: "in", column, value });
        return query;
      },
      then(
        onFulfilled: (value: { data: Row[]; error: null }) => unknown,
        onRejected?: (error: unknown) => unknown,
      ) {
        return Promise.resolve({ data: resolveRows(), error: null }).then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return { from: (table: string) => makeQuery(table) } as unknown as SupabaseClient;
}

function signedHeaders(rawBody: string, timestamp: number) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const requestId = "request-1";
  const userId = "fal-user-1";
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = `${requestId}\n${userId}\n${timestamp}\n${bodyHash}`;
  return {
    publicKey,
    headers: {
      "x-fal-webhook-request-id": requestId,
      "x-fal-webhook-user-id": userId,
      "x-fal-webhook-timestamp": String(timestamp),
      "x-fal-webhook-signature": encodeFalWebhookSignature(
        sign(null, Buffer.from(message), privateKey),
      ),
    },
  };
}

function trainingStore(): DataStore {
  const store = new DataStore();
  store.falTrainingRequests.set("request-1", {
    requestId: "request-1",
    familyId: "family-1",
    personaId: "persona-1",
    endpoint: "fal-ai/flux-2-trainer-v2",
    model: "flux-2-lora-v2",
    steps: 300,
    idempotencyKey: "persona-creation-training:event-1",
    status: "queued",
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  return store;
}

const successBody = JSON.stringify({
  request_id: "request-1",
  status: "OK",
  payload: {
    diffusers_lora_file: {
      url: "https://v3.fal.media/files/weights.safetensors",
      content_type: "application/octet-stream",
    },
    config_file: {
      url: "https://v3.fal.media/files/config.json",
      content_type: "application/json",
    },
  },
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("179 — deployed fal route production composition", () => {
  it("keeps the raw body, accepts canonical fal webhook headers, and dispatches only after signature verification", async () => {
    const timestamp = 1_800_000_000;
    const { headers, publicKey } = signedHeaders(successBody, timestamp);
    const store = trainingStore();
    const blobs = new InMemoryBlobStore();
    const downloads: string[] = [];
    const post = createFalWebhookPost({
      createRepository: () => store,
      createBlobStore: () => blobs,
      resolvePublicKeys: async () => [publicKey],
      now: () => timestamp,
      downloadArtifact: async (url) => {
        downloads.push(url);
        return url.endsWith("config.json")
          ? {
              bytes: Buffer.from(JSON.stringify({ architecture: "flux-2-lora-v2" })),
              contentType: "application/json",
              finalUrl: url,
            }
          : {
              bytes: makeTestSafetensorsArtifact({ model: "flux-2-lora-v2" }),
              contentType: "application/octet-stream",
              finalUrl: url,
            };
      },
    });

    const response = await post(new Request("https://app.example/api/webhooks/fal", {
      method: "POST",
      headers,
      body: successBody,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, duplicate: false });
    expect(downloads).toHaveLength(2);
    expect(store.falTrainingRequests.get("request-1")).toMatchObject({
      status: "ready",
      loraWeightKey: "lora/family-1/persona-1/weights.safetensors",
      configurationKey: "lora/family-1/persona-1/config.json",
    });
  });

  it("rejects legacy/unsigned, stale, and malformed requests before any callback claim or artifact fetch", async () => {
    const timestamp = 1_800_000_000;
    const signed = signedHeaders(successBody, timestamp);
    const store = trainingStore();
    const downloadArtifact = vi.fn();
    const post = createFalWebhookPost({
      createRepository: () => store,
      createBlobStore: () => new InMemoryBlobStore(),
      resolvePublicKeys: async () => [signed.publicKey],
      now: () => timestamp,
      downloadArtifact,
    });

    const legacyHeaders = {
      "x-fal-request-id": "request-1",
      "x-fal-user-id": "fal-user-1",
      "x-fal-timestamp": String(timestamp),
      "x-fal-signature": signed.headers["x-fal-webhook-signature"],
    };
    const legacy = await post(new Request("https://app.example/api/webhooks/fal", {
      method: "POST",
      headers: legacyHeaders,
      body: successBody,
    }));
    expect(legacy.status).toBe(401);

    const staleSigned = signedHeaders(successBody, timestamp - 301);
    const stalePost = createFalWebhookPost({
      createRepository: () => store,
      createBlobStore: () => new InMemoryBlobStore(),
      resolvePublicKeys: async () => [staleSigned.publicKey],
      now: () => timestamp,
      downloadArtifact,
    });
    const stale = await stalePost(new Request("https://app.example/api/webhooks/fal", {
      method: "POST",
      headers: staleSigned.headers,
      body: successBody,
    }));
    expect(stale.status).toBe(401);

    const malformedBody = "{\"request_id\":";
    const malformedSigned = signedHeaders(malformedBody, timestamp);
    const malformedPost = createFalWebhookPost({
      createRepository: () => store,
      createBlobStore: () => new InMemoryBlobStore(),
      resolvePublicKeys: async () => [malformedSigned.publicKey],
      now: () => timestamp,
      downloadArtifact,
    });
    const malformed = await malformedPost(new Request("https://app.example/api/webhooks/fal", {
      method: "POST",
      headers: malformedSigned.headers,
      body: malformedBody,
    }));
    expect(malformed.status).toBe(400);

    expect(store.falWebhookReceipts.size).toBe(0);
    expect(store.falTrainingRequests.get("request-1")?.status).toBe("queued");
    expect(downloadArtifact).not.toHaveBeenCalled();
  });

  it("resolves only fal's ED25519 JWKS keys and rejects an untrusted redirect", async () => {
    const { publicKey } = signedHeaders(successBody, 1_800_000_000);
    const jwk = publicKey.export({ format: "jwk" });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      keys: [jwk, { ...jwk, x: "" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const resolveKeys = createFalWebhookPublicKeyResolver({ fetchImpl: fetchImpl as typeof fetch });
    await expect(resolveKeys()).resolves.toHaveLength(1);

    const redirectFetch = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/keys.json" },
    }));
    const redirected = createFalWebhookPublicKeyResolver({ fetchImpl: redirectFetch as typeof fetch });
    await expect(redirected()).rejects.toThrow(/trusted fal|redirect/i);
  });

  it("round-trips selected provider metadata and callback receipts through Supabase persistence", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z").toISOString();
    const baseTables: Record<string, Record<string, unknown>[]> = {
      families: [{ id: "family-1", created_at: now }],
      personas: [{
        id: "persona-1",
        family_id: "family-1",
        created_by_member_id: "member-1",
        kind: "baby",
        display_name: "Maya",
        status: "training",
        lora_weight_key: null,
        avatar_key: null,
        likeness_confirmed: false,
        created_at: now,
      }],
      fal_training_requests: [{
        request_id: "request-1",
        family_id: "family-1",
        persona_id: "persona-1",
        endpoint: "fal-ai/flux-2-trainer-v2",
        model: "flux-2-lora-v2",
        steps: 300,
        idempotency_key: "persona-creation-training:event-1",
        status: "queued",
        input_zip_key: "training-inputs/family-1/persona-1/input.zip",
        lora_weight_key: null,
        configuration_key: null,
        error: null,
        created_at: now,
        updated_at: now,
      }],
      fal_webhook_receipts: [],
    };
    const recorded: { table: string; rows: Record<string, unknown>[] }[] = [];
    const first = new SupabaseDataStore(createStubSupabaseClient(baseTables, recorded));
    await first.hydrateFamily("family-1");
    expect(first.falTrainingRequests.get("request-1")).toMatchObject({
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: "persona-creation-training:event-1",
    });
    first.falWebhookReceipts.set("fingerprint-1", {
      requestId: "request-1",
      fingerprint: "fingerprint-1",
      receivedAt: new Date(now),
      status: "completed",
    });
    await first.sync();

    const requestRows = recorded.find((entry) => entry.table === "fal_training_requests")?.rows ?? [];
    const receiptRows = recorded.find((entry) => entry.table === "fal_webhook_receipts")?.rows ?? [];
    const reloaded = new SupabaseDataStore(createStubSupabaseClient({
      ...baseTables,
      fal_training_requests: requestRows,
      fal_webhook_receipts: receiptRows,
    }, []));
    await reloaded.hydrateFamily("family-1");
    expect(reloaded.falTrainingRequests.get("request-1")).toMatchObject({
      model: "flux-2-lora-v2",
      endpoint: "fal-ai/flux-2-trainer-v2",
      inputZipKey: "training-inputs/family-1/persona-1/input.zip",
    });
    expect(reloaded.falWebhookReceipts.get("fingerprint-1")).toMatchObject({
      requestId: "request-1",
      status: "completed",
    });
  });

  it("sends the selected training model at the real fal HTTP boundary", async () => {
    vi.stubEnv("FAL_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      request_id: "provider-request-1",
      status_url: "https://queue.fal.run/status",
      response_url: "https://queue.fal.run/result",
    }), { status: 200 })));

    await new RealFalAdapter().submitTraining({
      imageDataUrl: "https://storage.example/input.zip",
      defaultCaption: "subject",
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: "training-1",
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(fetchCall?.[1]?.body));
    expect(body.model).toBe("flux-2-lora-v2");
    expect(fetchCall?.[1]?.headers).toMatchObject({
      "X-Fal-Idempotency-Key": "training-1",
    });
  });

  it("rejects untrusted artifact origins and redirects before bytes are accepted", async () => {
    const fetchImpl = vi.fn();
    const download = createFalArtifactDownloader(fetchImpl as typeof fetch);
    await expect(download("https://evil.example/weights.safetensors")).rejects.toThrow(/trusted fal/i);
    expect(fetchImpl).not.toHaveBeenCalled();

    fetchImpl.mockResolvedValueOnce(new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/weights.safetensors" },
    }));
    await expect(download("https://v3.fal.media/redirect")).rejects.toThrow(/trusted fal|redirect/i);
  });
});
