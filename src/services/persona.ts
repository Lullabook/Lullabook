import { v4 as uuid } from "uuid";
import type {
  BlobStore,
  FalAdapter,
  LivenessAdapter,
  ModerationAdapter,
  NotificationAdapter,
  WorkflowAdapter,
} from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type {
  Baby,
  BabyPersonBond,
  Persona,
  PersonaKind,
  RosterScope,
  TraitQuestionnaire,
} from "@/domain/types";
import {
  FAL_FLUX_1_LORA_ENDPOINT,
  FAL_FLUX_1_LORA_MODEL,
  FAL_FLUX_1_TRAIN_ENDPOINT,
} from "@/adapters/fal";
import { likenessReviewSampleBlobKey, rosterAvatarBlobKey } from "@/lib/roster-avatar";
import { runPreflightChecks } from "@/services/preflight";
import { ConsentRequiredError, SubscriptionService } from "@/services/subscription";
import { ChildSafetyService } from "@/services/child-safety";
import type { EntitlementService } from "@/services/entitlement";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";

export interface CreatePersonaInput {
  memberId: string;
  displayName: string;
  photos: Buffer[];
  selfie?: Buffer;
  promotedFromCharacterId?: string;
  questionnaire?: TraitQuestionnaire;
}

export interface ReplacePersonaPhotosInput {
  personaId: string;
  memberId: string;
  photos: Buffer[];
  selfie?: Buffer;
}

export interface AtomicPersonaCreationInput extends CreatePersonaInput {
  kind: PersonaKind;
  /** Explicit subject consent is required for Adult Personas. */
  selfConsent?: boolean;
  /** Deliberately not accepted as a substitute for adult self-consent. */
  guardianAttestation?: boolean;
  baby?: {
    displayName: string;
    birthDate?: string | null;
    rosterScope?: RosterScope;
  };
  bond?: {
    relationship: string;
    babyCallsThem: string;
    theyCallBaby: string;
  };
}

export interface AtomicPersonaCreationResult {
  persona: Persona;
  baby?: Baby;
  bond?: BabyPersonBond;
}

const FAL_FLUX_1_PRICING_VERSION = "r1-fal-flux-1-v1";

const FAL_TRAINING_ROUTE = {
  endpoint: FAL_FLUX_1_TRAIN_ENDPOINT,
  model: FAL_FLUX_1_LORA_MODEL,
} as const;

const FAL_IMAGE_ROUTE = {
  endpoint: FAL_FLUX_1_LORA_ENDPOINT,
  model: FAL_FLUX_1_LORA_MODEL,
} as const;

export class PersonaService {
  constructor(
    private readonly store: DataStore,
    private readonly fal: FalAdapter,
    private readonly liveness: LivenessAdapter,
    private readonly moderation: ModerationAdapter,
    private readonly blobs: BlobStore,
    private readonly workflow: WorkflowAdapter,
    private readonly notifications: NotificationAdapter,
    private readonly subscriptions: SubscriptionService,
    private readonly childSafety: ChildSafetyService,
    private readonly entitlements?: EntitlementService,
    private readonly costMeter: ProviderCostMeteringService = new ProviderCostMeteringService(store)
  ) {}

  private assertFalSpendAllowed(
    familyId: string,
    route: { endpoint: string; model: string },
  ): void {
    this.costMeter.assertSpendAllowed({ familyId, provider: "fal.ai", ...route });
  }

  private async startFalTraining(
    persona: Persona,
    photos: Buffer[],
    attemptType: "training" | "retry",
    requestId: string,
  ): Promise<Awaited<ReturnType<FalAdapter["startTraining"]>>> {
    const startedAt = Date.now();
    this.assertFalSpendAllowed(persona.familyId, FAL_TRAINING_ROUTE);
    try {
      const job = await this.fal.startTraining(photos);
      this.costMeter.recordAttempt({
        provider: "fal.ai",
        ...FAL_TRAINING_ROUTE,
        pricingVersion: FAL_FLUX_1_PRICING_VERSION,
        units: { training_images: photos.length },
        estimatedCostUsd: 0,
        latencyMs: Math.max(0, Date.now() - startedAt),
        requestId: job.jobId,
        owningEntityIds: { familyId: persona.familyId, personaId: persona.id },
        attemptType,
        outcome: "succeeded",
      });
      return job;
    } catch (error) {
      this.costMeter.recordAttempt({
        provider: "fal.ai",
        ...FAL_TRAINING_ROUTE,
        pricingVersion: FAL_FLUX_1_PRICING_VERSION,
        units: { training_images: photos.length },
        estimatedCostUsd: 0,
        latencyMs: Math.max(0, Date.now() - startedAt),
        requestId,
        owningEntityIds: { familyId: persona.familyId, personaId: persona.id },
        attemptType,
        outcome: "failed",
      });
      throw error;
    }
  }

  private async generateFalImage(
    persona: Persona,
    prompt: string,
    idempotencyKey: string,
  ): Promise<Awaited<ReturnType<FalAdapter["generateImage"]>>> {
    const startedAt = Date.now();
    this.assertFalSpendAllowed(persona.familyId, FAL_IMAGE_ROUTE);
    try {
      const image = await this.fal.generateImage(prompt, persona.loraWeightKey!, { idempotencyKey });
      this.costMeter.recordAttempt({
        provider: "fal.ai",
        ...FAL_IMAGE_ROUTE,
        pricingVersion: FAL_FLUX_1_PRICING_VERSION,
        units: { images: 1 },
        estimatedCostUsd: 0,
        latencyMs: Math.max(0, Date.now() - startedAt),
        requestId: idempotencyKey,
        owningEntityIds: { familyId: persona.familyId, personaId: persona.id },
        attemptType: "image",
        outcome: "succeeded",
      });
      return image;
    } catch (error) {
      this.costMeter.recordAttempt({
        provider: "fal.ai",
        ...FAL_IMAGE_ROUTE,
        pricingVersion: FAL_FLUX_1_PRICING_VERSION,
        units: { images: 1 },
        estimatedCostUsd: 0,
        latencyMs: Math.max(0, Date.now() - startedAt),
        requestId: idempotencyKey,
        owningEntityIds: { familyId: persona.familyId, personaId: persona.id },
        attemptType: "image",
        outcome: "failed",
      });
      throw error;
    }
  }

  async createAdult(input: CreatePersonaInput): Promise<Persona> {
    const member = this.store.members.get(input.memberId);
    if (member) {
      if (member.role !== "guardian") {
        throw new Error("Only the Guardian may create Adult Personas in this release");
      }
      this.entitlements?.requirePersonaSlot(member.familyId, input.memberId);
    }
    return this.create(input, "adult", true);
  }

  async createBaby(input: CreatePersonaInput): Promise<Persona> {
    // Issue 172: the consent gate runs FIRST — before any photo is staged,
    // moderated, or sent to LoRA training (COPPA launch blocker).
    const gate = this.subscriptions.canCreateBabyPersona(input.memberId);
    if (!gate.allowed) {
      if (gate.code === "consent_required") {
        throw new ConsentRequiredError(gate.reason);
      }
      throw new Error(gate.reason ?? "Baby persona creation blocked");
    }
    const member = this.store.members.get(input.memberId);
    if (!member || member.role !== "guardian") {
      throw new Error("Only guardians may create baby personas");
    }
    this.entitlements?.requirePersonaSlot(member.familyId, input.memberId);
    return this.create(input, "baby", false);
  }

  /**
   * Creates the selected Persona, optional Baby, and optional Baby–Person bond
   * as one use case. Consent and moderation run before source-photo persistence;
   * every durable in-memory/blob write is compensated if a later step fails.
   */
  async createAtomic(
    input: AtomicPersonaCreationInput
  ): Promise<AtomicPersonaCreationResult> {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");
    if (member.role !== "guardian") {
      throw new Error("Only the Guardian may create Personas in this release");
    }
    if (input.kind === "baby") {
      const gate = this.subscriptions.canCreateBabyPersona(input.memberId);
      if (!gate.allowed) {
        if (gate.code === "consent_required") {
          throw new ConsentRequiredError(gate.reason);
        }
        throw new Error(gate.reason ?? "Baby persona creation blocked");
      }
    } else if (input.selfConsent !== true) {
      throw new Error("Adult Persona requires subject self-consent");
    }
    this.entitlements?.requireCanCreate(
      member.familyId,
      input.memberId,
      input.kind === "adult" ? "adult-persona" : "baby-persona",
    );
    this.entitlements?.requirePersonaSlot(member.familyId, input.memberId);

    const personaIds = new Set(this.store.personas.keys());
    const babyIds = new Set(this.store.babies.keys());
    const bondIds = new Set(this.store.babyPersonBonds.keys());
    const previousSelfPersonaId = member.selfPersonaId;
    const previousSelectedBabyId = member.selectedBabyId;

    try {
      const persona = await this.create(input, input.kind, input.kind === "adult");
      if (persona.status !== "ready") {
        throw new Error("Persona training failed");
      }

      let baby: Baby | undefined;
      if (input.baby) {
        const existingBabies = this.store.getBabiesByFamily(member.familyId, member.id);
        const birthDate = input.baby.birthDate;
        if (
          birthDate !== undefined &&
          birthDate !== null &&
          birthDate !== "" &&
          !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
        ) {
          throw new Error("Birthday must be YYYY-MM-DD");
        }
        baby = {
          id: uuid(),
          familyId: member.familyId,
          displayName: input.baby.displayName,
          birthDate: birthDate || null,
          dailyRoutine: null,
          rosterGroupId:
            input.baby.rosterScope === "shared" && existingBabies.length > 0
              ? existingBabies[0].rosterGroupId
              : uuid(),
          rosterScope: input.baby.rosterScope ?? "shared",
          isDefault: existingBabies.length === 0,
          createdAt: new Date(),
        };
        this.store.saveBaby(baby);
        if (baby.isDefault) member.selectedBabyId = baby.id;
      }

      let bond: BabyPersonBond | undefined;
      if (input.bond) {
        if (!baby) throw new Error("A Baby is required when creating a bond");
        bond = {
          id: uuid(),
          babyId: baby.id,
          personaId: persona.id,
          relationship: input.bond.relationship,
          babyCallsThem: input.bond.babyCallsThem,
          theyCallBaby: input.bond.theyCallBaby,
        };
        this.store.saveBabyPersonBond(bond);
      }

      return { persona, baby, bond };
    } catch (error) {
      for (const [id, candidate] of this.store.personas) {
        if (personaIds.has(id)) continue;
        if (candidate.avatarKey) await this.blobs.delete(candidate.avatarKey);
        await this.blobs.deletePrefix(`photos/${id}`);
        this.store.personas.delete(id);
      }
      for (const [id] of this.store.babyPersonBonds) {
        if (!bondIds.has(id)) this.store.babyPersonBonds.delete(id);
      }
      for (const [id] of this.store.babies) {
        if (!babyIds.has(id)) this.store.babies.delete(id);
      }
      member.selfPersonaId = previousSelfPersonaId;
      member.selectedBabyId = previousSelectedBabyId;
      throw error;
    }
  }

  async replacePhotos(input: ReplacePersonaPhotosInput): Promise<Persona> {
    const persona = this.store.getPersona(input.personaId, input.memberId);
    if (!persona) throw new Error("Persona not found");
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");

    if (persona.kind === "adult" && member.selfPersonaId !== persona.id) {
      throw new Error("Only the adult themself may update their reference photos");
    }
    if (persona.kind === "baby" && member.role !== "guardian") {
      throw new Error("Only guardians may update baby reference photos");
    }

    if (persona.kind === "adult") {
      if (!input.selfie) throw new Error("Selfie required for adult persona");
      const liveness = await this.liveness.verifySelfie(input.photos, input.selfie);
      if (!liveness.matched) throw new Error("Selfie does not match uploaded photos");
    }

    for (const photo of input.photos) {
      await this.childSafety.checkUpload(
        photo,
        `persona-replace-${member.id}-${uuid()}`,
        member.familyId
      );
    }

    const preflight = runPreflightChecks(input.photos);
    if (!preflight.passed) {
      throw new Error(`Pre-flight failed: ${preflight.reasons.join(", ")}`);
    }

    // Never clear an accepted likeness before its replacement has produced every
    // owned derivative. The candidate uses the same Persona ID but stays out of
    // the store until its LoRA, samples, avatar, and replacement photos exist.
    const oldPersona: Persona = {
      ...persona,
      reviewSampleKeys: [...(persona.reviewSampleKeys ?? [])],
    };
    const replacementId = uuid();
    const stagingPrefix = `photos-staging/${persona.id}/${replacementId}`;
    const candidate: Persona = {
      ...oldPersona,
      status: "training",
      loraWeightKey: null,
      avatarKey: null,
      reviewSampleKeys: [],
      likenessConfirmed: false,
    };

    try {
      for (let i = 0; i < input.photos.length; i++) {
        await this.blobs.put(`${stagingPrefix}/${i}.jpg`, input.photos[i]);
      }

      const job = await this.startFalTraining(
        candidate,
        input.photos,
        "training",
        `replacement-training/${candidate.id}/${replacementId}`,
      );
      await this.trainWithRetry(candidate, job.jobId, member.email, member.id, 1, {
        persist: false,
        derivativeScope: `replacement/${replacementId}`,
      });
      if (candidate.status !== "ready" || !candidate.loraWeightKey || !candidate.avatarKey) {
        throw new Error("Replacement likeness training did not complete");
      }

      // Commit source photos only after the new generated likeness is complete.
      // Source images remain write-only; staged data is deleted on every exit.
      await this.blobs.deletePrefix(`photos/${persona.id}`);
      for (let i = 0; i < input.photos.length; i++) {
        await this.blobs.put(`photos/${persona.id}/${i}.jpg`, input.photos[i]);
      }
      this.store.savePersona(candidate);
      await this.deleteOwnedDerivatives(oldPersona);
      await this.blobs.deletePrefix(stagingPrefix);
      return candidate;
    } catch (error) {
      await this.blobs.deletePrefix(stagingPrefix);
      await this.deletePersonaArtifacts(candidate);
      // The stored Persona remains the prior accepted one on every failed
      // replacement path, including partial derivative generation.
      this.store.savePersona(oldPersona);
      throw error;
    }
  }

  private async create(
    input: CreatePersonaInput,
    kind: PersonaKind,
    requireLiveness: boolean
  ): Promise<Persona> {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");

    if (requireLiveness) {
      if (!input.selfie) throw new Error("Selfie required for adult persona");
      const liveness = await this.liveness.verifySelfie(input.photos, input.selfie);
      if (!liveness.matched) throw new Error("Selfie does not match uploaded photos");
    }

    for (const photo of input.photos) {
      await this.childSafety.checkUpload(
        photo,
        `persona-upload-${member.id}-${uuid()}`,
        member.familyId
      );
    }

    const preflight = runPreflightChecks(input.photos);
    if (!preflight.passed) {
      throw new Error(`Pre-flight failed: ${preflight.reasons.join(", ")}`);
    }

    const persona: Persona = {
      id: uuid(),
      familyId: member.familyId,
      createdByMemberId: member.id,
      kind,
      displayName: input.displayName,
      status: "training",
      loraWeightKey: null,
      avatarKey: null,
      reviewSampleKeys: [],
      // Issue 125: likeness is NOT confirmed on creation — the Guardian must
      // review samples + accept before any book-generation spend.
      likenessConfirmed: false,
      promotedFromCharacterId: input.promotedFromCharacterId,
      questionnaire: input.questionnaire,
      createdAt: new Date(),
    };
    this.store.savePersona(persona);

    for (let i = 0; i < input.photos.length; i++) {
      await this.blobs.put(`photos/${persona.id}/${i}.jpg`, input.photos[i]);
    }

    const job = await this.startFalTraining(
      persona,
      input.photos,
      "training",
      `persona-training/${persona.id}`,
    );
    await this.trainWithRetry(persona, job.jobId, member.email, member.id);

    if (kind === "adult" && !member.selfPersonaId) {
      member.selfPersonaId = persona.id;
    }

    return this.store.personas.get(persona.id)!;
  }

  private async trainWithRetry(
    persona: Persona,
    jobId: string,
    email: string,
    memberId: string,
    attempt = 1,
    options: { persist?: boolean; derivativeScope?: string } = {}
  ): Promise<void> {
    // Inngest wait tooling must run directly. Every paid or mutating effect after
    // the durable wait is isolated in one deterministic memoized step.
    const webhook = await this.workflow.waitForEvent<{ status: string; loraWeightKey?: string }>(
      "fal.training.complete",
      jobId,
    );
    let retryJobId: string | undefined;
    await this.workflow.run([
      {
        name: "apply-training-result",
        idempotencyKey: `apply-training-result:${jobId}:${attempt}`,
        run: async () => {
          if (webhook.status === "ready") {
            persona.status = "ready";
            persona.loraWeightKey = webhook.loraWeightKey ?? `lora/${jobId}`;
            await this.generateAndStoreLikenessDerivatives(persona, options.derivativeScope);
            if (options.persist !== false) this.store.savePersona(persona);
            await this.notifications.sendEmail(email, "Your persona is ready", "~5 minutes");
            await this.notifications.sendWebPush(memberId, "Persona ready", "Training complete");
          } else if (attempt < 2) {
            const retry = await this.startFalTraining(
              persona,
              [],
              "retry",
              `persona-training-retry/${persona.id}/${attempt + 1}`,
            );
            retryJobId = retry.jobId;
          } else {
            persona.status = "failed";
            if (options.persist !== false) this.store.savePersona(persona);
            await this.notifications.sendEmail(email, "Training failed — refund issued", "");
          }
        },
      },
    ]);
    if (retryJobId) {
      await this.trainWithRetry(persona, retryJobId, email, memberId, attempt + 1, options);
    }
  }

  private async deletePersonaArtifacts(persona: Persona): Promise<void> {
    for (const key of persona.reviewSampleKeys ?? []) await this.blobs.delete(key);
    if (persona.avatarKey) await this.blobs.delete(persona.avatarKey);
    if (persona.loraWeightKey) await this.blobs.delete(persona.loraWeightKey);
  }

  private async deleteOwnedDerivatives(persona: Persona): Promise<void> {
    for (const key of persona.reviewSampleKeys ?? []) await this.blobs.delete(key);
    if (persona.avatarKey) await this.blobs.delete(persona.avatarKey);
    if (persona.loraWeightKey) await this.blobs.delete(persona.loraWeightKey);
    for (const request of this.store.falTrainingRequests.values()) {
      if (request.personaId !== persona.id) continue;
      for (const key of [request.loraWeightKey, request.configurationKey, request.inputZipKey]) {
        if (key) await this.blobs.delete(key);
      }
    }
  }

  private async generateAndStoreLikenessDerivatives(
    persona: Persona,
    scope?: string
  ): Promise<void> {
    if (!persona.loraWeightKey) return;
    const generationId = uuid();
    const sampleKeys: string[] = [];
    let avatarKey: string | undefined;
    const idempotencyPrefix = scope ? `${scope}/` : "";
    try {
      for (let index = 0; index < 2; index++) {
        const sample = await this.generateFalImage(
          persona,
          `Likeness review sample ${index + 1}: ${persona.displayName} in a gentle storybook scene, no raw photo`,
          `${idempotencyPrefix}likeness-sample/${persona.id}/${generationId}/${index}`,
        );
        const sampleKey = likenessReviewSampleBlobKey(
          persona.familyId,
          persona.id,
          generationId,
          index
        );
        await this.blobs.put(sampleKey, sample.bytes ?? Buffer.from("likeness-review-sample"));
        sampleKeys.push(sampleKey);
      }
      avatarKey = rosterAvatarBlobKey(persona.familyId, persona.id, generationId);
      const portrait = await this.generateFalImage(
        persona,
        `Neutral portrait headshot of ${persona.displayName}, soft storybook illustration, plain warm background`,
        `${idempotencyPrefix}roster-avatar/${persona.id}/${generationId}`,
      );
      await this.blobs.put(avatarKey, portrait.bytes ?? Buffer.from("roster-avatar"));
      persona.avatarKey = avatarKey;
      persona.reviewSampleKeys = sampleKeys;
    } catch (error) {
      // A partial review set must never become a selectable likeness surface.
      for (const key of sampleKeys) await this.blobs.delete(key);
      if (avatarKey) await this.blobs.delete(avatarKey);
      persona.avatarKey = null;
      persona.reviewSampleKeys = [];
      throw error;
    }
  }

  getLikenessSamples(personaId: string, actorMemberId: string): string[] {
    const persona = this.store.getPersona(personaId, actorMemberId);
    // Samples are served while the Persona is in `review` (ticket 188) and after
    // likeness is confirmed (`ready`); never for training/failed Personas.
    if (!persona || (persona.status !== "ready" && persona.status !== "review")) return [];
    return (persona.reviewSampleKeys ?? []).map(
      (key) =>
        `/api/personas/${encodeURIComponent(persona.id)}/likeness-samples?key=${encodeURIComponent(key)}`
    );
  }

  acceptLikeness(personaId: string, actorMemberId: string): Persona {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    // Ticket 188: the canonical post-training state before likeness acceptance
    // is `review`; legacy `ready`-but-unconfirmed rows are still accepted here.
    // `training` and terminal `failed` are spend-blocked and cannot be accepted.
    if (persona.status !== "ready" && persona.status !== "review") {
      throw new Error("Cannot confirm likeness for a persona that is not ready");
    }
    const member = this.store.members.get(actorMemberId);
    // Baby: Guardian privilege. Adult: the SUBJECT of the likeness — the
    // Member whose Self Persona this is (ADR-0014 self-consent). R1 has one
    // Member login, so roster adults (grandma, co-parent) have no linked
    // subject Member; their self-consent was captured at creation
    // (selfie/liveness), and the creating Member reviews likeness quality.
    // When a subject Member IS linked, only they may confirm — never the
    // Guardian on their behalf.
    const subjectMember = [...this.store.members.values()].find(
      (m) => m.selfPersonaId === persona.id
    );
    const authorized =
      persona.kind === "baby"
        ? member?.role === "guardian"
        : subjectMember
          ? member?.id === subjectMember.id
          : member?.id === persona.createdByMemberId;
    if (!authorized) {
      throw new Error(
        persona.kind === "baby"
          ? "Only guardians may confirm likeness"
          : "Only the Adult subject may confirm their own likeness"
      );
    }
    // Issue 125: flip the gate so book generation is unlocked for this persona.
    // Ticket 188: `review -> likeness-confirmed -> Story-ready` persists as
    // status `ready` + likeness_confirmed true (the Story-ready mapping).
    persona.likenessConfirmed = true;
    if (persona.status === "review") persona.status = "ready";
    this.store.savePersona(persona);
    return persona;
  }

  /**
   * Ticket 188 — durable retrain of a Persona in likeness review. Runs the
   * byte-level gates (liveness, moderation, preflight) and the in-memory
   * authority/state checks before the route persists the transition through
   * the authoritative SQL RPC and submits a replacement training job. The
   * in-memory transition is compensated by the route when the RPC rejects.
   */
  async retrainForReview(input: {
    personaId: string;
    memberId: string;
    photos: Buffer[];
    selfie?: Buffer;
  }): Promise<Persona> {
    const persona = this.store.getPersona(input.personaId, input.memberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "review") {
      throw new Error("Only a Persona in likeness review may be retrained");
    }
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");

    const subjectMember = [...this.store.members.values()].find(
      (m) => m.selfPersonaId === persona.id
    );
    const authorized =
      persona.kind === "baby"
        ? member?.role === "guardian"
        : subjectMember
          ? member?.id === subjectMember.id
          : member?.id === persona.createdByMemberId;
    if (!authorized) {
      throw new Error(
        persona.kind === "baby"
          ? "Only Guardians may retrain a Baby Persona"
          : "Only the Adult subject may retrain their own likeness"
      );
    }

    for (const photo of input.photos) {
      await this.childSafety.checkUpload(
        photo,
        `persona-retrain-${persona.id}`,
        member.familyId
      );
    }
    if (persona.kind === "adult") {
      if (!input.selfie) throw new Error("Selfie required for adult persona");
      const liveness = await this.liveness.verifySelfie(input.photos, input.selfie);
      if (!liveness.matched) throw new Error("Selfie does not match uploaded photos");
    }
    const preflight = runPreflightChecks(input.photos);
    if (!preflight.passed) {
      throw new Error(`Pre-flight failed: ${preflight.reasons.join(", ")}`);
    }

    // Do not mutate or persist `review -> training` here. The caller must submit
    // the replacement provider job first; otherwise a provider outage strands
    // the durable Persona in `training` with no callback able to recover it.
    return persona;
  }
}

/**
 * Provider submission is the first side effect of retraining. The durable
 * lifecycle transition and local state mutation happen only after submission
 * succeeds, so a failed provider boundary leaves `review` retryable.
 */
export async function submitRetrainingThenCommit<T>(input: {
  submit: () => Promise<T>;
  transition: () => Promise<unknown>;
  onCommitted: () => void;
}): Promise<T> {
  const result = await input.submit();
  await input.transition();
  input.onCommitted();
  return result;
}

/**
 * Ticket 188 — the persisted Story-ready mapping. Legacy `ready` maps to
 * Story-ready ONLY when likeness is confirmed; `failed` is terminal; `review`
 * and `training` are spend-blocked. Mirrors the personas.story_ready generated
 * column read by the production API.
 */
export function personaStoryReadiness(
  persona: Pick<Persona, "status" | "likenessConfirmed">
): { storyReady: boolean; reason: string } {
  if (persona.status === "failed") {
    return { storyReady: false, reason: "failed-persona-terminal" };
  }
  if (persona.status !== "ready") {
    return { storyReady: false, reason: `${persona.status}-spend-blocked` };
  }
  if (persona.likenessConfirmed !== true) {
    return { storyReady: false, reason: "likeness-not-confirmed" };
  }
  return { storyReady: true, reason: "story-ready" };
}
