import { createFalWebhookPublicKeyResolver } from "@/adapters/fal-webhook";
import { SupabaseFalTrainingLifecycleRepository } from "@/db/fal-training-lifecycle";
import { createServiceClient } from "@/lib/supabase";
import { createBlobStore as createProductionBlobStore } from "@/lib/create-blob-store";
import { createFalWebhookPost } from "./handler";

const resolveProductionFalPublicKeys = createFalWebhookPublicKeyResolver();

export const POST = createFalWebhookPost({
  createRepository: () => new SupabaseFalTrainingLifecycleRepository(createServiceClient()),
  createBlobStore: createProductionBlobStore,
  resolvePublicKeys: resolveProductionFalPublicKeys,
});
