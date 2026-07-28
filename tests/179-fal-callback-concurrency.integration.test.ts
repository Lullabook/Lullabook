import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import {
  createFalWebhookVerifier,
  encodeFalWebhookSignature,
  type FalWebhookHeaders,
} from "@/adapters/fal-webhook";
import { PostgresFalTrainingLifecycleRepository } from "@/db/fal-training-lifecycle";
import { FalTrainingWebhookService } from "@/services/fal-training-webhook";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";

const timestamp = 1_800_000_000;
const requestId = "provider-training-request-1";
const body = JSON.stringify({
  request_id: requestId,
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

function signedRequest(): { headers: FalWebhookHeaders; publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"] } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const userId = "fal-user-1";
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = `${requestId}\n${userId}\n${timestamp}\n${bodyHash}`;
  return {
    publicKey,
    headers: {
      requestId,
      userId,
      timestamp: String(timestamp),
      signature: encodeFalWebhookSignature(sign(null, Buffer.from(message), privateKey)),
    },
  };
}

describe("179 — durable concurrent fal callback claim", () => {
  it("allows one artifact copy/state transition across two service instances and a restart", async () => {
    await withIsolatedPostgres(async ({ asSystem, fixture }) => {
      await asSystem(
        `insert into fal_training_requests (
          request_id, family_id, persona_id, endpoint, model, steps,
          idempotency_key, status
        ) values ($1, $2, $3, $4, $5, 300, $6, 'queued')`,
        [
          requestId,
          fixture.familyA.familyId,
          fixture.familyA.personaId,
          "fal-ai/flux-2-trainer-v2",
          "flux-2-lora-v2",
          "persona-creation-training:event-1",
        ],
      );

      const signed = signedRequest();
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [signed.publicKey],
      });
      const blobs = new InMemoryBlobStore();
      const downloads: string[] = [];
      const download = vi.fn(async (url: string) => {
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
      });

      const repositoryA = new PostgresFalTrainingLifecycleRepository(asSystem);
      const repositoryB = new PostgresFalTrainingLifecycleRepository(asSystem);
      const serviceA = new FalTrainingWebhookService(repositoryA, blobs, verifier, () => new Date(timestamp * 1000));
      const serviceB = new FalTrainingWebhookService(repositoryB, blobs, verifier, () => new Date(timestamp * 1000));

      const results = await Promise.all([
        serviceA.handle(signed.headers, body, download),
        serviceB.handle(signed.headers, body, download),
      ]);

      expect(results.filter((result) => result.duplicate)).toHaveLength(1);
      expect(results.filter((result) => !result.duplicate)).toHaveLength(1);
      expect(downloads).toHaveLength(2);

      const persisted = await asSystem<{
        status: string;
        lora_weight_key: string;
        configuration_key: string;
      }>(
        "select status, lora_weight_key, configuration_key from fal_training_requests where request_id = $1",
        [requestId],
      );
      expect(persisted.rows[0]).toEqual({
        status: "ready",
        lora_weight_key: `lora/${fixture.familyA.familyId}/${fixture.familyA.personaId}/weights.safetensors`,
        configuration_key: `lora/${fixture.familyA.familyId}/${fixture.familyA.personaId}/config.json`,
      });

      const receipts = await asSystem<{ count: string; status: string }>(
        "select count(*)::text as count, min(status) as status from fal_webhook_receipts where request_id = $1",
        [requestId],
      );
      expect(receipts.rows[0]).toEqual({ count: "1", status: "completed" });

      const restarted = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asSystem),
        blobs,
        verifier,
        () => new Date(timestamp * 1000),
      );
      await expect(restarted.handle(signed.headers, body, download)).resolves.toMatchObject({
        accepted: true,
        duplicate: true,
      });
      expect(downloads).toHaveLength(2);
    });
  });
});
