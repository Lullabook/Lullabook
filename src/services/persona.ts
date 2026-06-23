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
import type { Persona, PersonaKind, TraitQuestionnaire } from "@/domain/types";
import { rosterAvatarBlobKey } from "@/lib/roster-avatar";
import { runPreflightChecks } from "@/services/preflight";
import { SubscriptionService } from "@/services/subscription";
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
    if (this.entitlements) {
      const member = this.store.members.get(input.memberId);
      if (member) {
        this.entitlements.requireMemberSlot(member.familyId, input.memberId);
      }
    }
    return this.create(input, "adult", true);
  }

  async createBaby(input: CreatePersonaInput): Promise<Persona> {
    const gate = this.subscriptions.canCreateBabyPersona(input.memberId);
    if (!gate.allowed) {
      throw new Error(gate.reason ?? "Baby persona creation blocked");
    }
    const member = this.store.members.get(input.memberId);
    if (!member || member.role !== "guardian") {
      throw new Error("Only guardians may create baby personas");
    }
    return this.create(input, "baby", false);
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

    await this.blobs.deletePrefix(`photos/${persona.id}`);
    if (persona.avatarKey) {
      await this.blobs.delete(persona.avatarKey);
    }

    persona.status = "training";
    persona.loraWeightKey = null;
    persona.avatarKey = null;
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
    await this.workflow.run([
      {
        name: "wait-for-training",
        idempotencyKey: `wait-for-training:${jobId}`,
        run: async () => {
          const webhook = await this.workflow.waitForEvent<{ status: string; loraWeightKey?: string }>(
            "fal.training.complete",
            jobId
          );
          if (webhook.status === "ready") {
            persona.status = "ready";
            persona.loraWeightKey = webhook.loraWeightKey ?? `lora/${jobId}`;
            await this.generateAndStoreRosterAvatar(persona);
            this.store.savePersona(persona);
            await this.notifications.sendEmail(email, "Your persona is ready", "~5 minutes");
            await this.notifications.sendWebPush(memberId, "Persona ready", "Training complete");
          } else if (attempt < 2) {
            const retry = await this.fal.startTraining([]);
            await this.trainWithRetry(persona, retry.jobId, email, memberId, attempt + 1);
          } else {
            persona.status = "failed";
            this.store.savePersona(persona);
            await this.notifications.sendEmail(email, "Training failed — refund issued", "");
          }
        },
      },
    ]);
  }

  private async generateAndStoreRosterAvatar(persona: Persona): Promise<void> {
    if (!persona.loraWeightKey) return;
    const key = rosterAvatarBlobKey(persona.familyId, persona.id);
    const portrait = await this.fal.generateImage(
      `Neutral portrait headshot of ${persona.displayName}, soft storybook illustration, plain warm background`,
      persona.loraWeightKey,
      { idempotencyKey: `roster-avatar/${persona.id}` }
    );
    await this.blobs.put(key, portrait.bytes ?? Buffer.from("roster-avatar"));
    persona.avatarKey = key;
  }

  getLikenessSamples(personaId: string, actorMemberId: string): string[] {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona || persona.status !== "ready" || !persona.avatarKey) return [];
    return [`/api/avatars?key=${encodeURIComponent(persona.avatarKey)}`];
  }

  acceptLikeness(personaId: string, actorMemberId: string): Persona {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "ready") {
      throw new Error("Cannot confirm likeness for a persona that is not ready");
    }
    // Issue 125 / BUG 6 (red-team): only the Guardian may confirm likeness —
    // the corollary of "only a Guardian may create a Baby Persona." A non-
    // Guardian Member of the same family must not flip the generation gate.
    const member = this.store.members.get(actorMemberId);
    if (member?.role !== "guardian") {
      throw new Error("Only guardians may confirm likeness");
    }
    // Issue 125: flip the gate so book generation is unlocked for this persona.
    persona.likenessConfirmed = true;
    this.store.savePersona(persona);
    return persona;
  }
}
