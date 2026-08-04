import { createFalWebhookPublicKeyResolver } from "@/adapters/fal-webhook";
import { SupabaseFalTrainingLifecycleRepository } from "@/db/fal-training-lifecycle";
import { createServiceClient } from "@/lib/supabase";
import { selectFalAdapter } from "@/lib/dev-bypass";
import { createBlobStore as createProductionBlobStore } from "@/lib/create-blob-store";
import { createFalWebhookPost } from "./handler";

const resolveProductionFalPublicKeys = createFalWebhookPublicKeyResolver();

export const POST = createFalWebhookPost({
  createRepository: () => new SupabaseFalTrainingLifecycleRepository(createServiceClient()),
  createBlobStore: createProductionBlobStore,
  resolvePublicKeys: resolveProductionFalPublicKeys,
  // Signed successful callbacks generate Family-owned likeness-review samples
  // from the trained LoRA before the `training -> review` transition persists.
  fal: selectFalAdapter(),
});
