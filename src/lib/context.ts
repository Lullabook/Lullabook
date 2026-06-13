import { RealAnthropicAdapter } from "@/adapters/anthropic";
import { R2BlobStore } from "@/adapters/blob-store";
import { CuratedClassicCatalog } from "@/adapters/classic-catalog";
import { optionalEnv } from "@/adapters/env";
import { RealFalAdapter } from "@/adapters/fal";
import { InngestWorkflowAdapter } from "@/adapters/inngest";
import { RekognitionLivenessAdapter } from "@/adapters/liveness";
import { PermissiveDevModeration, RealModerationAdapter } from "@/adapters/moderation";
import { RealNotificationAdapter } from "@/adapters/notifications";
import { PdfLibAdapter } from "@/adapters/pdf";
import { RealStripeAdapter } from "@/adapters/stripe";
import { SupabaseDataStore } from "@/db/supabase-store";
import { createServiceClient } from "@/lib/supabase";
import { CharacterService } from "@/services/character";
import { ChildSafetyService } from "@/services/child-safety";
import { ColdStartService } from "@/services/cold-start";
import { ExportService } from "@/services/export";
import { FamilyService } from "@/services/family";
import { HardDeleteService } from "@/services/hard-delete";
import { OnboardingService } from "@/services/onboarding";
import { PersonaRosterService } from "@/services/persona-roster";
import { PersonaService } from "@/services/persona";
import { SharingService } from "@/services/sharing";
import { StorybookService } from "@/services/storybook";
import { SubscriptionService } from "@/services/subscription";
import { TextStoryService } from "@/services/text-story";

export type RequestContext = ReturnType<typeof createRequestContext>;

/**
 * Composition root: one unit of work per request (or per workflow step
 * cycle). The SupabaseDataStore starts empty — callers hydrate the relevant
 * Family, run services unchanged, then `await ctx.persist()` before
 * responding (which also flushes any Inngest event sends buffered by
 * `enqueue`).
 */
export function createRequestContext() {
  const store = new SupabaseDataStore(createServiceClient());

  const anthropic = new RealAnthropicAdapter();
  const classicCatalog = new CuratedClassicCatalog();
  const fal = new RealFalAdapter();
  // ADR-0010: real classifiers in production (fail closed). Locally, when no
  // Sightengine account is configured, fall back to a permissive dev adapter
  // so the app is clickable — never in production.
  const moderation =
    optionalEnv("SIGHTENGINE_API_USER") || process.env.NODE_ENV === "production"
      ? new RealModerationAdapter()
      : new PermissiveDevModeration();
  const liveness = new RekognitionLivenessAdapter();
  const blobs = new R2BlobStore();
  const workflow = new InngestWorkflowAdapter();
  const notifications = new RealNotificationAdapter();
  const stripe = new RealStripeAdapter();
  const pdf = new PdfLibAdapter();

  const childSafety = new ChildSafetyService(store, moderation);
  const subscriptions = new SubscriptionService(store, stripe);
  const personas = new PersonaService(
    store,
    fal,
    liveness,
    moderation,
    blobs,
    workflow,
    notifications,
    subscriptions,
    childSafety
  );
  const characters = new CharacterService(store, personas);
  // ADR-0005: multi-persona pages go through the Gemini reference-model path
  // only once the composition spike passes; flipped by env, not a deploy.
  const useReferenceModelForMulti =
    optionalEnv("MULTI_PERSONA_REF_MODEL") === "true";
  const storybooks = new StorybookService(
    store,
    anthropic,
    fal,
    childSafety,
    blobs,
    workflow,
    subscriptions,
    classicCatalog,
    useReferenceModelForMulti
  );
  const sharing = new SharingService(store);
  const family = new FamilyService(store);
  const hardDelete = new HardDeleteService(store, blobs, notifications);
  const exportSvc = new ExportService(store, pdf, (key) => blobs.signedUrl(key));
  const coldStart = new ColdStartService(store, storybooks);
  const onboarding = new OnboardingService(store);
  const roster = new PersonaRosterService(store);
  const textStories = new TextStoryService(store, anthropic, childSafety);

  return {
    store,
    workflow,
    blobs,
    notifications,
    childSafety,
    subscriptions,
    characters,
    personas,
    storybooks,
    sharing,
    family,
    hardDelete,
    exportSvc,
    coldStart,
    onboarding,
    roster,
    textStories,
    /** Sync map mutations to Postgres, then release buffered Inngest sends. */
    async persist(): Promise<void> {
      await store.sync();
      await workflow.flush();
    },
  };
}
