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
import { runPreflightChecks } from "@/services/preflight";
import { SubscriptionService } from "@/services/subscription";
import { ChildSafetyService } from "@/services/child-safety";

export interface CreatePersonaInput {
  memberId: string;
  displayName: string;
  photos: Buffer[];
  selfie?: Buffer;
  promotedFromCharacterId?: string;
  questionnaire?: TraitQuestionnaire;
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
    private readonly childSafety: ChildSafetyService
  ) {}

  async createAdult(input: CreatePersonaInput): Promise<Persona> {
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

  getLikenessSamples(personaId: string, actorMemberId: string): string[] {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona || persona.status !== "ready") return [];
    return [`https://example.com/sample/${persona.id}/1.png`];
  }

  acceptLikeness(personaId: string, actorMemberId: string): Persona {
    const persona = this.store.getPersona(personaId, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    return persona;
  }
}
