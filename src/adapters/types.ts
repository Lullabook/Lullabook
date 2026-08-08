import type { GeneratedStory, StyleBible, StoryType, TraitQuestionnaire } from "@/domain/types";

export interface ClassicSourceTale {
  id: string;
  title: string;
  plotBeats: string[];
}

export interface ClassicCatalog {
  getById(id: string): ClassicSourceTale | null;
}

export interface TextStoryGenerationInput {
  theme: string;
  note?: string;
  storyType: StoryType;
  characters: { displayName: string; questionnaire: TraitQuestionnaire }[];
}

export interface VideoClipResult {
  videoUrl: string;
  bytes?: Buffer;
}

export interface VideoAdapter {
  generatePageClip(
    illustrationBlobKey: string,
    narrationText: string,
    options?: { idempotencyKey?: string }
  ): Promise<VideoClipResult>;
}

export interface AnthropicAdapter {
  generateStory(input: {
    brief: string;
    personaNames: string[];
    /** Stable IDs used in Scene and Style Bible output; names remain prose-only. */
    personaIds?: string[];
    characterNames?: string[];
    pageCount: number;
    storyType: StoryType;
    lullabyPhrase?: string;
    momentContext?: string;
  }): Promise<GeneratedStory>;
  generateTextStory(input: TextStoryGenerationInput): Promise<{ text: string }>;
  adaptStory(input: {
    sourceTale: ClassicSourceTale;
    personaNames: string[];
    personaIds?: string[];
    pageCount: number;
    storyType: StoryType;
    twist?: string;
  }): Promise<GeneratedStory>;
  /**
   * Produce a short (1–2 sentence) blurb describing a fictional Character
   * from its Trait Questionnaire (issue 46). Internal/engine-facing — the
   * parent never writes it directly.
   */
  generateCharacterDescription(
    questionnaire: TraitQuestionnaire
  ): Promise<{ description: string }>;
}

export interface FalTrainingSubmission {
  imageDataUrl: string;
  defaultCaption: string;
  endpoint: string;
  model: string;
  steps: number;
  idempotencyKey: string;
  webhookUrl?: string;
}

export interface FalTrainResult {
  jobId: string;
  status: "queued";
  /**
   * Ticket 208 / FAIL-4 — the fal queue `status_url` returned by the submit
   * response. Retaining it lets the reconciliation watchdog poll the exact
   * queue entry fal created instead of guessing a URL, so a training whose
   * callback never arrives is still driven to a terminal state.
   */
  statusUrl?: string;
}

export interface FalTrainingFile {
  url: string;
  content_type?: string;
  file_name?: string;
  file_size?: number;
}

export type FalTrainingLifecycle = "queued" | "running" | "ready" | "failed";

export interface FalTrainingRequestRecord {
  requestId: string;
  familyId: string;
  personaId: string;
  endpoint: string;
  model: string;
  steps: number;
  idempotencyKey: string;
  status: FalTrainingLifecycle;
  inputZipKey?: string;
  loraWeightKey?: string;
  configurationKey?: string;
  error?: string;
  /** Retained fal queue status URL (ticket 208 / FAIL-4 reconciliation seam). */
  statusUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Ticket 208 — what the watchdog asks fal about one in-flight training. */
export interface FalTrainingStatusQuery {
  requestId: string;
  endpoint: string;
  /** Retained submit-time `status_url`; the adapter derives one when absent. */
  statusUrl?: string;
}

/**
 * Normalised fal queue status, shaped exactly like the webhook body so the
 * watchdog drives the SAME terminal transition as a signed callback.
 */
export interface FalTrainingStatusResult {
  requestId: string;
  status: "OK" | "ERROR" | "IN_PROGRESS";
  payload?: {
    diffusers_lora_file?: FalTrainingFile;
    config_file?: FalTrainingFile;
  };
  error?: string;
}

export interface FalWebhookReceipt {
  requestId: string;
  fingerprint: string;
  receivedAt: Date;
  status?: "processing" | "completed";
  leaseExpiresAt?: Date;
}

export interface FalTrainWebhook {
  jobId: string;
  status: "ready" | "failed";
  loraWeightKey?: string;
  sampleImageUrls?: string[];
  configurationUrl?: string;
}

export interface FalImageResult {
  imageUrl: string;
  bytes?: Buffer;
  /** Real queue request identifier used for durable cost/evidence attribution. */
  providerRequestId?: string;
  contentType?: string;
}

export interface FalGenerateImageOptions {
  idempotencyKey?: string;
}

/** Provider-neutral, auditable input for one Storybook Page. */
export interface FalPageImageRequest {
  pageIndex: number;
  prompt: string;
  loras: { personaId: string; path: string; scale: number }[];
  personaIds: string[];
  styleBible: StyleBible;
  seed: number;
  seedMetadata: {
    storybookId: string;
    pageIndex: number;
    algorithm: "storybook-page-seed-v1";
  };
  provider: string;
  model: string;
  modelVersion: string;
  endpoint: string;
  safety: { enabled: boolean };
  idempotencyKey: string;
}

export interface FalPageRepairRequest extends FalPageImageRequest {
  tier: "nano-banana-2-edit" | "nano-banana-pro-edit";
  /** Signed URL for the preceding owned Page attempt, never a provider placeholder. */
  failedPageImageUrl: string;
  /** Signed Family-owned likeness samples or avatars, one for each selected Persona. */
  identityReferenceImageUrls: string[];
}

export interface FalAdapter {
  startTraining(photos: Buffer[]): Promise<FalTrainResult>;
  submitTraining(input: FalTrainingSubmission): Promise<FalTrainResult>;
  /**
   * Ticket 208 / FAIL-4 — read one training's terminal status straight from
   * fal's queue. This is the reconciliation seam: it makes training independent
   * of the callback arriving. Optional so dev-only fakes need not implement it;
   * the watchdog reports an unreconcilable request instead of guessing.
   */
  fetchTrainingStatus?(query: FalTrainingStatusQuery): Promise<FalTrainingStatusResult>;
  /** Development adapters are never valid release evidence. */
  readonly isDevOnly?: boolean;
  generateImage(
    prompt: string,
    loraKey: string,
    options?: FalGenerateImageOptions
  ): Promise<FalImageResult>;
  /** One request containing all selected Persona LoRAs for a Page. */
  generatePageImage?(input: FalPageImageRequest): Promise<FalImageResult>;
  /** Selective, bounded repair of one failed Page. */
  repairPageImage?(input: FalPageRepairRequest): Promise<FalImageResult>;
  inpaintFaces(
    baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult>;
  generateWithReferenceModel(
    prompt: string,
    referenceImageUrls: string[]
  ): Promise<FalImageResult>;
}

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  csamDetected?: boolean;
}

export interface ModerationAdapter {
  checkImage(image: Buffer): Promise<ModerationResult>;
  checkText(text: string): Promise<ModerationResult>;
}

export interface LivenessResult {
  matched: boolean;
  confidence: number;
}

export interface LivenessAdapter {
  verifySelfie(photos: Buffer[], selfie: Buffer): Promise<LivenessResult>;
}

export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
  signedUrl(key: string): Promise<string>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export interface StripeAdapter {
  createCheckoutSession(familyId: string): Promise<StripeCheckoutSession>;
  cancelSubscription(stripeSubscriptionId: string): Promise<void>;
}

export interface WorkflowStep {
  name: string;
  idempotencyKey?: string;
  run: () => Promise<void>;
}

/**
 * Serializable description of an enqueued job. The in-memory fake runs the
 * closure directly; the real durable adapter cannot ship a closure across the
 * queue boundary, so it sends this payload as an event and the workflow
 * function re-invokes the matching service body from persisted state.
 */
export type WorkflowJobPayload =
  | { type: "storybook-generate"; storybookId: string; memberId: string }
  | { type: "page-recover"; pageId: string; memberId: string; attempt: number }
  | {
      type: "persona-creation-finalized";
      eventId: string;
      familyId: string;
      personaId: string;
      reservationId: string;
    };

export interface PersonaCreatePayload {
  mode: "adult" | "baby" | "promote-character";
  memberId: string;
  displayName: string;
  characterId?: string;
  kind?: "baby" | "adult";
  photoKeys: string[];
  selfieKey?: string;
}

export interface WorkflowAdapter {
  enqueue(name: string, work: () => Promise<void>, payload?: WorkflowJobPayload): void;
  run(steps: WorkflowStep[]): Promise<void>;
  waitForEvent<T>(eventName: string, matchId: string): Promise<T>;
  emitEvent<T>(eventName: string, data: T): Promise<void>;
  requestPersonaCreate(payload: PersonaCreatePayload): void;
  flush(): Promise<void>;
}

export interface NotificationAdapter {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendWebPush(memberId: string, title: string, body: string): Promise<void>;
}

export interface PdfAdapter {
  generateStorybookPdf(storybook: {
    title: string;
    pages: { text: string; illustrationUrl: string }[];
  }): Promise<Buffer>;
}

/** RevenueCat purchase/entitlement result. */
export interface RevenueCatPurchaseResult {
  /** The entitlement id RevenueCat associates with the purchase. */
  entitlementId: string;
  /** Whether this was a trial start vs a direct purchase. */
  isTrial: boolean;
  /**
   * Server-side adapters must mark an unresolved native transaction false.
   * The optional shape keeps the deterministic legacy fake source-compatible;
   * production adapters never treat a pending transaction as entitlement proof.
   */
  verified?: boolean;
  subscriptionId?: string;
  productId?: string;
  expirationAtMs?: number;
}

export interface RevenueCatEntitlementEvidence {
  tier: string;
  isTrial: boolean;
  /** RevenueCat/Apple evidence has been verified by the adapter. */
  verified?: boolean;
  subscriptionId?: string;
  productId?: string;
  expirationAtMs?: number;
}

/** Normalized RevenueCat lifecycle event consumed by the server service. */
export interface RevenueCatLifecycleEvent {
  eventId: string;
  type: string;
  appUserId: string;
  productId?: string;
  subscriptionId?: string;
  expirationAtMs?: number;
  eventTimestampMs?: number;
  isTrial?: boolean;
  /** Legacy deterministic fakes may provide the normalized tier directly. */
  tier?: string;
  entitlementIds?: string[];
}

/** RevenueCat adapter for IAP + entitlement reconciliation (issue 194). */
export interface RevenueCatPurchaseAdapter {
  /** Start a trial for the given tier; requires card-on-file. */
  startTrial(
    familyId: string,
    tier: string,
    options: { hasPaymentMethod: boolean }
  ): Promise<RevenueCatPurchaseResult>;
  /** Direct purchase (non-trial) of a tier. */
  purchase(
    familyId: string,
    tier: string,
    options: { hasPaymentMethod: boolean }
  ): Promise<RevenueCatPurchaseResult>;
  /** Sync the current entitlement from RevenueCat; returns null on outage. */
  fetchEntitlement(familyId: string): Promise<RevenueCatEntitlementEvidence | null>;
  /** Native restore is optional until the native SDK profile is installed. */
  restorePurchases?(familyId: string): Promise<RevenueCatEntitlementEvidence | null>;
}
