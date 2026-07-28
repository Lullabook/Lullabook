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
import { likenessReviewSampleBlobKey, rosterAvatarBlobKey } from "@/lib/roster-avatar";
import { runPreflightChecks } from "@/services/preflight";
import { ConsentRequiredError, SubscriptionService } from "@/services/subscription";
import { ChildSafetyService } from "@/services/child-safety";
import type { EntitlementService } from "@/services/entitlement";

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
    private readonly entitlements?: EntitlementService
  ) {}

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
      await this.childSafety.checkUpload(photo, `persona-replace-${member.id}-${uuid()}`);
    }

    const preflight = runPreflightChecks(input.photos);
    if (!preflight.passed) {
      throw new Error(`Pre-flight failed: ${preflight.reasons.join(", ")}`);
    }

    await this.deleteOwnedDerivatives(persona);
    await this.blobs.deletePrefix(`photos/${persona.id}`);

    persona.status = "training";
    persona.loraWeightKey = null;
    persona.avatarKey = null;
    persona.reviewSampleKeys = [];
    persona.likenessConfirmed = false;
    this.store.savePersona(persona);

    for (let i = 0; i < input.photos.length; i++) {
      await this.blobs.put(`photos/${persona.id}/${i}.jpg`, input.photos[i]);
    }

    const job = await this.fal.startTraining(input.photos);
    await this.trainWithRetry(persona, job.jobId, member.email, member.id);

    return this.store.personas.get(persona.id)!;
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
      await this.childSafety.checkUpload(photo, `persona-upload-${member.id}-${uuid()}`);
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

    const job = await this.fal.startTraining(input.photos);
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
    attempt = 1
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
            await this.generateAndStoreLikenessDerivatives(persona);
            this.store.savePersona(persona);
            await this.notifications.sendEmail(email, "Your persona is ready", "~5 minutes");
            await this.notifications.sendWebPush(memberId, "Persona ready", "Training complete");
          } else if (attempt < 2) {
            const retry = await this.fal.startTraining([]);
            retryJobId = retry.jobId;
          } else {
            persona.status = "failed";
            this.store.savePersona(persona);
            await this.notifications.sendEmail(email, "Training failed — refund issued", "");
          }
        },
      },
    ]);
    if (retryJobId) {
      await this.trainWithRetry(persona, retryJobId, email, memberId, attempt + 1);
    }
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

  private async generateAndStoreLikenessDerivatives(persona: Persona): Promise<void> {
    if (!persona.loraWeightKey) return;
    const generationId = uuid();
    const sampleKeys: string[] = [];
    for (let index = 0; index < 2; index++) {
      const sample = await this.fal.generateImage(
        `Likeness review sample ${index + 1}: ${persona.displayName} in a gentle storybook scene, no raw photo`,
        persona.loraWeightKey,
        { idempotencyKey: `likeness-sample/${persona.id}/${generationId}/${index}` }
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
    const key = rosterAvatarBlobKey(persona.familyId, persona.id, generationId);
    const portrait = await this.fal.generateImage(
      `Neutral portrait headshot of ${persona.displayName}, soft storybook illustration, plain warm background`,
      persona.loraWeightKey,
      { idempotencyKey: `roster-avatar/${persona.id}/${generationId}` }
    );
    await this.blobs.put(key, portrait.bytes ?? Buffer.from("roster-avatar"));
    persona.avatarKey = key;
    persona.reviewSampleKeys = sampleKeys;
  }

  getLikenessSamples(personaId: string, actorMemberId: string): string[] {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona || persona.status !== "ready") return [];
    return (persona.reviewSampleKeys ?? []).map(
      (key) =>
        `/api/personas/${encodeURIComponent(persona.id)}/likeness-samples?key=${encodeURIComponent(key)}`
    );
  }

  acceptLikeness(personaId: string, actorMemberId: string): Persona {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "ready") {
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
    persona.likenessConfirmed = true;
    this.store.savePersona(persona);
    return persona;
  }
}
