import { RealAnthropicAdapter } from "@/adapters/anthropic";
import { createBlobStore } from "@/lib/create-blob-store";
import { CuratedClassicCatalog } from "@/adapters/classic-catalog";
import { optionalEnv } from "@/adapters/env";
import { FakeLiveness } from "@/adapters/fakes";
import { createWorkflowAdapter, LocalDevWorkflowAdapter } from "@/lib/create-workflow-adapter";
import { RekognitionLivenessAdapter } from "@/adapters/liveness";
import {
  selectFalAdapter,
  selectNotificationAdapter,
  shouldDevBypassLiveness,
} from "@/lib/dev-bypass";
import { PermissiveDevModeration, RealModerationAdapter } from "@/adapters/moderation";
import { PdfLibAdapter } from "@/adapters/pdf";
import { RealStripeAdapter } from "@/adapters/stripe";
import { RealRevenueCatPurchaseAdapter } from "@/adapters/revenuecat-purchase";
import { SupabaseDataStore } from "@/db/supabase-store";
import { createServiceClient } from "@/lib/supabase";
import { BabyService } from "@/services/baby";
import { CharacterService } from "@/services/character";
import { ChildSafetyService } from "@/services/child-safety";
import { ColdStartService } from "@/services/cold-start";
import { ExportService } from "@/services/export";
import { FamilyRosterService } from "@/services/family-roster";
import { FamilyService } from "@/services/family";
import { HardDeleteService } from "@/services/hard-delete";
import { OnboardingService } from "@/services/onboarding";
import { PersonaRosterService } from "@/services/persona-roster";
import { PersonaService } from "@/services/persona";
import { SharingService } from "@/services/sharing";
import { StorybookService } from "@/services/storybook";
import { SubscriptionService } from "@/services/subscription";
import { TextStoryService } from "@/services/text-story";
import { VoiceClipService } from "@/services/voice-clip";
import { MomentService } from "@/services/moment";
import { JournalNudgeService } from "@/services/journal-nudge";
import { PastStorySummaryService } from "@/services/past-story-summary";
import { EntitlementService } from "@/services/entitlement";
import { RevenueCatPurchaseService } from "@/services/revenuecat-purchase";
import { StoryCapService } from "@/services/story-cap";
import { CreditLedgerService } from "@/services/credit-ledger";
import { CustomStyleService } from "@/services/custom-style";
import { HomeDashboardService } from "@/services/home-dashboard";
import { WorldService } from "@/services/world";

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
  // Issue 123: dev fal fallback — flag-only (`DEV_FAL_FALLBACK` + non-prod).
  // A present FAL_API_KEY no longer defeats the explicit flag; the dev .env.local
  // sets a key, so the old `&& !optionalEnv("FAL_API_KEY")` clause always picked
  // the real adapter in dev → 100% illustration failure (synthetic LoRA keys
  // are not real fal paths). Double-gated, inert in production.
  const fal = selectFalAdapter();
  // ADR-0010: real classifiers in production (fail closed). Locally, when no
  // Sightengine account is configured, fall back to a permissive dev adapter
  // so the app is clickable — never in production.
  const moderation =
    optionalEnv("SIGHTENGINE_API_USER") || process.env.NODE_ENV === "production"
      ? new RealModerationAdapter()
      : new PermissiveDevModeration();
  // Issue 108: dev liveness bypass — in dev with DEV_LIVENESS_BYPASS=true, wire
  // FakeLiveness so the Simulator can create an Adult Persona from library
  // photos + a library selfie without Rekognition. Double-gated, inert in prod.
  const liveness = shouldDevBypassLiveness()
    ? new FakeLiveness()
    : new RekognitionLivenessAdapter();
  const blobs = createBlobStore();
  const workflow = createWorkflowAdapter();
  // Persona-create fix: without INNGEST_EVENT_KEY the training workflow runs
  // INLINE (LocalDevWorkflowAdapter), so a missing RESEND_API_KEY made
  // `sendEmail` throw inside `POST /api/personas` → 400 (no Persona was ever
  // creatable locally). Key-presence gated like moderation above; production
  // always gets RealNotificationAdapter and keeps failing loud.
  const notifications = selectNotificationAdapter();
  const stripe = new RealStripeAdapter();
  const pdf = new PdfLibAdapter();
  const subscriptions = new SubscriptionService(store, stripe);
  const entitlements = new EntitlementService(store, subscriptions);
  const revenuecatPurchases = new RevenueCatPurchaseService(
    store,
    subscriptions,
    new RealRevenueCatPurchaseAdapter(),
    entitlements
  );
  const storyCap = new StoryCapService(store, entitlements);
  const credits = new CreditLedgerService(store, entitlements);
  const customStyles = new CustomStyleService(store, fal, workflow, blobs, entitlements, credits);

  const childSafety = new ChildSafetyService(store, moderation);
  const personas = new PersonaService(
    store,
    fal,
    liveness,
    moderation,
    blobs,
    workflow,
    notifications,
    subscriptions,
    childSafety,
    entitlements
  );
  const characters = new CharacterService(store, anthropic, childSafety);
  const babies = new BabyService(store);
  const familyRoster = new FamilyRosterService(store);
  const voiceClips = new VoiceClipService(store, blobs, entitlements, undefined, notifications);
  const moments = new MomentService(store);
  const journalNudges = new JournalNudgeService(store, moments);
  const pastStorySummary = new PastStorySummaryService(store);
  const world = new WorldService(store, babies, familyRoster);
  // R1 pages always use the canonical multi-LoRA request. Reference-model
  // fallback is intentionally unavailable because it cannot prove owned inputs.
  const storybooks = new StorybookService(
    store,
    anthropic,
    fal,
    childSafety,
    blobs,
    workflow,
    subscriptions,
    classicCatalog,
    false,
    null,
    null,
    pastStorySummary,
    entitlements
  );
  const sharing = new SharingService(store);
  const family = new FamilyService(store, notifications);
  const hardDelete = new HardDeleteService(store, blobs, notifications);
  const exportSvc = new ExportService(store, pdf, (key) => blobs.signedUrl(key));
  const persistStore = async () => store.sync();
  const dispatchWorkflow = async () => workflow.flush();
  const coldStart = new ColdStartService(store, storybooks, {
    persist: persistStore,
    dispatch: dispatchWorkflow,
  });
  const onboarding = new OnboardingService(store);
  const roster = new PersonaRosterService(store);
  const textStories = new TextStoryService(store, anthropic, childSafety);
  const homeDashboard = new HomeDashboardService(store, moments, storybooks);

  return {
    store,
    workflow,
    blobs,
    notifications,
    childSafety,
    liveness,
    fal,
    subscriptions,
    characters,
    babies,
    familyRoster,
    voiceClips,
    moments,
    journalNudges,
    pastStorySummary,
    entitlements,
    revenuecatPurchases,
    storyCap,
    credits,
    customStyles,
    homeDashboard,
    world,
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
      await persistStore();
      await dispatchWorkflow();
      // Sync order matters and differs by adapter. Inngest only *sends* events
      // here, so state must be committed first — a remote worker must never
      // read a store that hasn't landed. LocalDevWorkflowAdapter instead
      // DRAINS the jobs inline, mutating this same store during the dispatch
      // above; without a second sync the terminal status and every Page it
      // produced are silently dropped and the book strands in `generating`.
      if (workflow instanceof LocalDevWorkflowAdapter) await persistStore();
    },
  };
}
