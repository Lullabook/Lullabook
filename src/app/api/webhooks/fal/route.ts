import { NextResponse } from "next/server";
import type { BlobStore } from "@/adapters/types";
import {
  createFalWebhookPublicKeyResolver,
  createFalWebhookVerifier,
  type FalWebhookHeaders,
  type FalWebhookPublicKey,
} from "@/adapters/fal-webhook";
import { createFalArtifactDownloader, type ArtifactDownloader } from "@/services/fal-lora-training";
import { FalTrainingWebhookService } from "@/services/fal-training-webhook";
import type { DataStore } from "@/db/store";
import {
  SupabaseFalTrainingLifecycleRepository,
  type FalTrainingLifecycleRepository,
} from "@/db/fal-training-lifecycle";
import { createServiceClient } from "@/lib/supabase";
import { createBlobStore as createProductionBlobStore } from "@/lib/create-blob-store";

export interface FalWebhookRouteDependencies {
  createRepository: () => DataStore | FalTrainingLifecycleRepository;
  createBlobStore: () => BlobStore;
  resolvePublicKeys: () => Promise<FalWebhookPublicKey[]>;
  downloadArtifact?: ArtifactDownloader;
  now?: () => number;
}

export function createFalWebhookPost(dependencies: FalWebhookRouteDependencies) {
  return async function post(req: Request): Promise<NextResponse> {
    // Preserve exactly the bytes fal signed. No req.json(), normalization, or
    // business dispatch occurs before the verifier accepts this raw body.
    const rawBody = await req.text();
    const headers: FalWebhookHeaders = {
      requestId: req.headers.get("x-fal-webhook-request-id") ?? "",
      userId: req.headers.get("x-fal-webhook-user-id") ?? "",
      timestamp: req.headers.get("x-fal-webhook-timestamp") ?? "",
      signature: req.headers.get("x-fal-webhook-signature") ?? "",
    };
    const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));

    try {
      const verifier = createFalWebhookVerifier({
        now,
        resolvePublicKeys: dependencies.resolvePublicKeys,
      });
      const service = new FalTrainingWebhookService(
        dependencies.createRepository(),
        dependencies.createBlobStore(),
        verifier,
        () => new Date(now() * 1000),
      );
      const result = await service.handle(
        headers,
        rawBody,
        dependencies.downloadArtifact ?? createFalArtifactDownloader(),
      );
      return NextResponse.json({ received: true, duplicate: result.duplicate });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Webhook processing failed";
      const status = /signature|public key|timestamp|stale|signed header/i.test(message)
        ? 401
        : /unknown.*request/i.test(message)
          ? 404
          : /fetch fal artifact|artifact \(5\d\d\)/i.test(message)
            ? 502
            : 400;
      return NextResponse.json({ error: message }, { status });
    }
  };
}

const resolveProductionFalPublicKeys = createFalWebhookPublicKeyResolver();

export const POST = createFalWebhookPost({
  createRepository: () => new SupabaseFalTrainingLifecycleRepository(createServiceClient()),
  createBlobStore: createProductionBlobStore,
  resolvePublicKeys: resolveProductionFalPublicKeys,
});
