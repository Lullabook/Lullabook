import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { FakeFal, InMemoryBlobStore } from "@/adapters/fakes";
import {
  createFalWebhookVerifier,
  encodeFalWebhookSignature,
  type FalWebhookHeaders,
} from "@/adapters/fal-webhook";
import { PostgresFalTrainingLifecycleRepository } from "@/db/fal-training-lifecycle";
import { FalReviewSampleGenerator, FalTrainingWebhookService } from "@/services/fal-training-webhook";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";

const timestamp = 1_800_000_000;
const requestId = "provider-training-request-188";

function trainingBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
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
    ...overrides,
  });
}

function signedRequest(rawBody: string, at = timestamp): {
  headers: FalWebhookHeaders;
  publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"];
} {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  let parsedRequestId = requestId;
  try {
    const parsed = JSON.parse(rawBody) as { request_id?: string };
    parsedRequestId = parsed.request_id ?? parsedRequestId;
  } catch {
    // Structural-invalid bodies still use the expected provider request header.
  }
  const userId = "fal-user-188";
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const message = `${parsedRequestId}\n${userId}\n${at}\n${bodyHash}`;
  return {
    publicKey,
    headers: {
      requestId: parsedRequestId,
      userId,
      timestamp: String(at),
      signature: encodeFalWebhookSignature(sign(null, Buffer.from(message), privateKey)),
    },
  };
}

function artifactDownload() {
  return vi.fn(async (url: string) =>
    url.endsWith("config.json")
      ? {
          bytes: Buffer.from(JSON.stringify({ architecture: "flux-2-lora-v2" })),
          contentType: "application/json",
          finalUrl: url,
        }
      : {
          bytes: makeTestSafetensorsArtifact({ model: "flux-2-lora-v2" }),
          contentType: "application/octet-stream",
          finalUrl: url,
        },
  );
}

async function seedQueuedTraining(
  asSystem: (text: string, values?: unknown[]) => Promise<{ rows: never[] }>,
  fixture: { familyId: string; memberId: string },
  personaId: string,
  idempotencyKey = "persona-creation-training:event-188",
): Promise<void> {
  await asSystem(
    `insert into personas (id, family_id, created_by_member_id, kind, display_name, status)
     values ($1, $2, $3, 'baby', 'Training Baby', 'training')`,
    [personaId, fixture.familyId, fixture.memberId],
  );
  await asSystem(
    `insert into fal_training_requests (
      request_id, family_id, persona_id, endpoint, model, steps, idempotency_key, status
     ) values ($1, $2, $3, 'fal-ai/flux-2-trainer-v2', 'flux-2-lora-v2', 300, $4, 'queued')`,
    [requestId, fixture.familyId, personaId, idempotencyKey],
  );
}

describe("188 — fal callback idempotency and durable Persona lifecycle", () => {
  it("callback completion is SECURITY DEFINER but callable only by service_role", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem }) => {
      const result = await asSystem<{
        security_definer: boolean;
        service_exec: boolean;
        authenticated_exec: boolean;
        six_arg_overloads: number;
      }>(`
        select
          function_info.prosecdef as security_definer,
          has_function_privilege('service_role', function_info.oid, 'EXECUTE') as service_exec,
          has_function_privilege('authenticated', function_info.oid, 'EXECUTE') as authenticated_exec,
          (
            select count(*)::integer
            from pg_proc old_function
            join pg_namespace old_namespace on old_namespace.oid = old_function.pronamespace
            where old_namespace.nspname = 'public'
              and old_function.proname = 'app_complete_fal_training_callback'
              and old_function.pronargs = 6
          ) as six_arg_overloads
        from pg_proc function_info
        join pg_namespace function_namespace on function_namespace.oid = function_info.pronamespace
        where function_namespace.nspname = 'public'
          and function_info.proname = 'app_complete_fal_training_callback'
          and function_info.pronargs = 7
      `);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toEqual({
        security_definer: true,
        service_exec: true,
        authenticated_exec: false,
        six_arg_overloads: 0,
      });
    });
  });

  it("a signed OK callback durably persists training -> review with Family-owned keys and review samples", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000801";
      await seedQueuedTraining(asSystem, fixture.familyA, personaId);

      const body = trainingBody();
      const signed = signedRequest(body);
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [signed.publicKey],
      });
      const blobs = new InMemoryBlobStore();
      const download = artifactDownload();
      const fal = new FakeFal();
      const service = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        blobs,
        verifier,
        () => new Date(timestamp * 1000),
        new FalReviewSampleGenerator(fal, blobs),
      );

      await expect(service.handle(signed.headers, body, download)).resolves.toMatchObject({
        accepted: true,
        duplicate: false,
      });

      const request = await asService<{
        status: string;
        lora_weight_key: string;
        configuration_key: string;
        error: string | null;
      }>(
        "select status, lora_weight_key, configuration_key, error from fal_training_requests where request_id = $1",
        [requestId],
      );
      expect(request.rows[0]).toEqual({
        status: "ready",
        lora_weight_key: `lora/${fixture.familyA.familyId}/${personaId}/weights.safetensors`,
        configuration_key: `lora/${fixture.familyA.familyId}/${personaId}/config.json`,
        error: null,
      });

      const persona = await asService<{
        status: string;
        lora_weight_key: string;
        review_sample_keys: unknown;
        failure_reason: string | null;
        story_ready: boolean;
      }>(
        `select status, lora_weight_key, review_sample_keys, failure_reason, story_ready
         from personas where id = $1`,
        [personaId],
      );
      const reviewSampleKeys = (persona.rows[0]!.review_sample_keys as unknown[]).map(String);
      expect(persona.rows[0]!.status).toBe("review");
      expect(persona.rows[0]!.lora_weight_key).toBe(`lora/${fixture.familyA.familyId}/${personaId}/weights.safetensors`);
      expect(persona.rows[0]!.failure_reason).toBeNull();
      expect(persona.rows[0]!.story_ready).toBe(false);
      expect(reviewSampleKeys).toHaveLength(2);
      expect(reviewSampleKeys.every((key) => key.startsWith(`likeness-samples/${fixture.familyA.familyId}/${personaId}/`))).toBe(true);

      // Owned blobs: LoRA, configuration, and both review samples exist.
      expect(await blobs.list(`lora/${fixture.familyA.familyId}/${personaId}/`)).toHaveLength(2);
      expect(await blobs.list(`likeness-samples/${fixture.familyA.familyId}/${personaId}/`)).toHaveLength(2);
      expect(fal.likenessSampleImageCalls).toBe(2);

      // A provider URL is never stored as an owned key.
      const owned = await asService<{ count: string }>(
        `select count(*)::text as count from (
           select lora_weight_key as key from fal_training_requests where request_id = $1
           union all select configuration_key from fal_training_requests where request_id = $1
           union all select review_sample_keys::text from personas where id = $2
         ) keys where key like 'http%'`,
        [requestId, personaId],
      );
      expect(owned.rows[0]?.count).toBe("0");
    });
  });

  it("uses a short-lived signed URL when sending the Family-owned LoRA to fal for review samples", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000806";
      await seedQueuedTraining(asSystem, fixture.familyA, personaId);

      const body = trainingBody();
      const signed = signedRequest(body);
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [signed.publicKey],
      });
      const blobs = new InMemoryBlobStore();
      const fal = new FakeFal();
      const generateImage = vi.spyOn(fal, "generateImage");
      const service = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        blobs,
        verifier,
        () => new Date(timestamp * 1000),
        new FalReviewSampleGenerator(fal, blobs),
      );

      await service.handle(signed.headers, body, artifactDownload());

      expect(generateImage).toHaveBeenCalledTimes(2);
      for (const [, loraInput] of generateImage.mock.calls) {
        expect(loraInput).toBe(`memory://lora/${fixture.familyA.familyId}/${personaId}/weights.safetensors`);
        expect(loraInput).not.toBe(`lora/${fixture.familyA.familyId}/${personaId}/weights.safetensors`);
      }
    });
  });

  it("a duplicate callback copies artifacts and samples at most once and never re-transitions", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000802";
      await seedQueuedTraining(asSystem, fixture.familyA, personaId);

      const body = trainingBody();
      const signed = signedRequest(body);
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [signed.publicKey],
      });
      const blobs = new InMemoryBlobStore();
      const download = artifactDownload();
      const fal = new FakeFal();
      const service = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        blobs,
        verifier,
        () => new Date(timestamp * 1000),
        new FalReviewSampleGenerator(fal, blobs),
      );

      await service.handle(signed.headers, body, download);
      const second = await service.handle(signed.headers, body, download);
      expect(second).toMatchObject({ accepted: true, duplicate: true });

      expect(download).toHaveBeenCalledTimes(2);
      expect(fal.likenessSampleImageCalls).toBe(2);
      const receipts = await asService<{ count: string }>(
        "select count(*)::text as count from fal_webhook_receipts where request_id = $1",
        [requestId],
      );
      expect(receipts.rows[0]?.count).toBe("1");
      const persona = await asService<{ status: string }>(
        "select status from personas where id = $1",
        [personaId],
      );
      expect(persona.rows[0]?.status).toBe("review");
    });
  });

  it("verifies timestamp, body hash, parseability, and signature before any claim or state change", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000803";
      await seedQueuedTraining(asSystem, fixture.familyA, personaId);

      const body = trainingBody();
      const valid = signedRequest(body, timestamp);
      const stale = signedRequest(body, timestamp - 301);
      const unparseable = signedRequest("{not json", timestamp);
      const invalidSignature = {
        ...valid.headers,
        signature: encodeFalWebhookSignature(Buffer.alloc(64, 9)),
      };
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [valid.publicKey, stale.publicKey, unparseable.publicKey],
      });
      const service = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        new InMemoryBlobStore(),
        verifier,
        () => new Date(timestamp * 1000),
      );

      await expect(service.handle(stale.headers, body)).rejects.toThrow(/stale|timestamp/i);
      await expect(service.handle(unparseable.headers, "{not json")).rejects.toThrow(/hash|unparseable/i);
      await expect(service.handle(invalidSignature, body)).rejects.toThrow(/signature/i);

      const state = await asService<{
        status: string;
        receipts: string;
        persona_status: string;
      }>(
        `select
          (select status from fal_training_requests where request_id = $1) as status,
          (select count(*)::text from fal_webhook_receipts where request_id = $1) as receipts,
          (select status from personas where id = $2) as persona_status`,
        [requestId, personaId],
      );
      expect(state.rows[0]).toEqual({ status: "queued", receipts: "0", persona_status: "training" });
    });
  });

  it("ignores stale, malformed, and out-of-order callbacks without moving a completed Persona", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000804";
      await seedQueuedTraining(asSystem, fixture.familyA, personaId);

      const okBody = trainingBody();
      const progressBody = trainingBody({ status: "IN_PROGRESS" });
      const malformedOk = trainingBody({ payload: {} });
      const errorBody = trainingBody({ status: "ERROR", error: "upstream refused" });
      const ok = signedRequest(okBody, timestamp);
      const progress = signedRequest(progressBody, timestamp);
      const malformed = signedRequest(malformedOk, timestamp);
      const failed = signedRequest(errorBody, timestamp);
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [ok.publicKey, progress.publicKey, malformed.publicKey, failed.publicKey],
      });
      const blobs = new InMemoryBlobStore();
      const download = artifactDownload();
      const service = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        blobs,
        verifier,
        () => new Date(timestamp * 1000),
      );

      await expect(service.handle(ok.headers, okBody, download)).resolves.toMatchObject({ accepted: true });
      await expect(service.handle(progress.headers, progressBody, download)).resolves.toMatchObject({ accepted: true });
      await expect(service.handle(malformed.headers, malformedOk, download)).rejects.toThrow(/result|artifact|config/i);
      await expect(service.handle(failed.headers, errorBody, download)).resolves.toMatchObject({ accepted: true });

      const persona = await asService<{ status: string }>("select status from personas where id = $1", [personaId]);
      const request = await asService<{ status: string }>(
        "select status from fal_training_requests where request_id = $1",
        [requestId],
      );
      expect(persona.rows[0]?.status).toBe("review");
      expect(request.rows[0]?.status).toBe("ready");
    });
  });

  it("a real training failure marks the Persona failed with a redacted reason and consumes no Storybook allowance", { timeout: 20_000 }, async () => {
    await withIsolatedPostgres(async ({ asSystem, asService, fixture }) => {
      const personaId = "00000000-0000-0000-0000-000000000805";
      await seedQueuedTraining(asSystem, fixture.familyA, personaId);

      const failedBody = trainingBody({
        status: "ERROR",
        error: "secret=provider-token upstream timeout",
      });
      const signed = signedRequest(failedBody);
      const verifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [signed.publicKey],
      });
      const service = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        new InMemoryBlobStore(),
        verifier,
        () => new Date(timestamp * 1000),
      );

      await expect(service.handle(signed.headers, failedBody)).resolves.toMatchObject({ accepted: true });

      const request = await asService<{ status: string; error: string }>(
        "select status, error from fal_training_requests where request_id = $1",
        [requestId],
      );
      expect(request.rows[0]?.status).toBe("failed");
      expect(request.rows[0]?.error).toMatch(/upstream timeout/);
      expect(request.rows[0]?.error).not.toContain("provider-token");

      const persona = await asService<{ status: string; failure_reason: string }>(
        "select status, failure_reason from personas where id = $1",
        [personaId],
      );
      expect(persona.rows[0]?.status).toBe("failed");
      expect(persona.rows[0]?.failure_reason).toMatch(/upstream timeout/);
      expect(persona.rows[0]?.failure_reason).not.toContain("provider-token");

      const allowance = await asService<{ count: string }>(
        "select count(*)::text as count from story_allowance_reservations where family_id = $1",
        [fixture.familyA.familyId],
      );
      expect(allowance.rows[0]?.count).toBe("0");

      // `failed` is terminal: a late signed OK callback cannot resurrect it.
      const okBody = trainingBody();
      const ok = signedRequest(okBody);
      const lateOkVerifier = createFalWebhookVerifier({
        now: () => timestamp,
        resolvePublicKeys: async () => [ok.publicKey],
      });
      const lateService = new FalTrainingWebhookService(
        new PostgresFalTrainingLifecycleRepository(asService),
        new InMemoryBlobStore(),
        lateOkVerifier,
        () => new Date(timestamp * 1000),
      );
      await expect(lateService.handle(ok.headers, okBody, artifactDownload())).resolves.toMatchObject({ accepted: true });
      const terminal = await asService<{ status: string }>("select status from personas where id = $1", [personaId]);
      expect(terminal.rows[0]?.status).toBe("failed");
    });
  });
});
