import { NextResponse } from "next/server";
import { createFalWebhookVerifier, type FalWebhookHeaders } from "@/adapters/fal-webhook";
import { FalTrainingWebhookService } from "@/services/fal-training-webhook";
import { SupabaseDataStore } from "@/db/supabase-store";
import { createServiceClient } from "@/lib/supabase";
import { createBlobStore } from "@/lib/create-blob-store";

/**
 * fal.ai training-completion webhook.
 *
 * The signed `FalTrainingWebhookService` authenticates the raw body
 * (timestamp + body-hash + ED25519 signature) before any JSON parsing,
 * handles duplicate/stale/malformed callbacks idempotently, validates and
 * copies provider artifacts into Family-owned storage, and records durable
 * outcomes with redacted errors.
 *
 * Issue 179: replaces the previous thin JSON relay with the signed service.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const rawBody = await req.text();

  const headers: FalWebhookHeaders = {
    requestId: req.headers.get("x-fal-request-id") ?? "",
    userId: req.headers.get("x-fal-user-id") ?? "",
    timestamp: req.headers.get("x-fal-timestamp") ?? "",
    signature: req.headers.get("x-fal-signature") ?? "",
  };

  try {
    const store = new SupabaseDataStore(createServiceClient());
    const blobs = createBlobStore();
    const verifier = createFalWebhookVerifier({
      resolvePublicKeys: async () => {
        // In production, resolve fal's rotating JWKS-published ED25519 keys.
        // The key resolver is injected here so the verifier has zero access to
        // FAL_API_KEY; it only checks callback authenticity.
        // TODO(179): wire fal.ai JWKS endpoint once published documentation is
        // available; until then the verifier rejects all callbacks in
        // production (safe default) and tests inject keys directly.
        return [];
      },
    });
    const service = new FalTrainingWebhookService(store, blobs, verifier);
    const result = await service.handle(
      headers,
      rawBody,
      async (url: string) => {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch artifact: ${response.status}`);
        return Buffer.from(await response.arrayBuffer());
      },
    );
    return NextResponse.json({ received: true, duplicate: result.duplicate });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    const status =
      /signature|public key|timestamp|stale/i.test(message) ? 401
      : /unknown.*request/i.test(message) ? 404
      : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
