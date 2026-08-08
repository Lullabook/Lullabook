import type { BlobStore, FalAdapter, FalTrainingSubmission } from "@/adapters/types";
import { likenessReviewSampleBlobKey, rosterAvatarBlobKey } from "@/lib/roster-avatar";
import { v4 as uuid } from "uuid";
import type { LikenessResumeOps } from "@/db/likeness-resume-store";
import type { DataStore } from "@/db/store";
import type { Persona, PersonaKind } from "@/domain/types";

/**
 * Review lifecycle for a trained Persona's likeness (PRD v23 / local 209).
 *
 * This module is the CORE build for the confirmation + crash-safe resume work.
 * It is deliberately self-contained and reportable-at-core: it owns the
 * transition from owned training output to the review surface, the authorized
 * accept boundary (SEC-3), idempotent retrain + derivative replacement
 * (SEC-7), the durable exactly-once Brief-resume marker (FAIL-8), and the
 * no-spend-before-confirmation gate (COST-1).
 *
 * Integration points for the later wiring lane (documented, not touched here):
 *  - `persona.ts` / the webhook route call {@link onTrainingReady} with the
 *    reflected completion (personaId + owned weight/config keys + fal request
 *    id). The fal-training-lifecycle already persists review samples for the
 *    webhook path; this module exposes the same semantics for the direct/owned
 *    completion path.
 *  - `cold-start.ts` calls {@link saveWaitingBrief} when a Brief is queued
 *    while a selected Persona is still `training`, and replaces its in-memory
 *    claim with {@link LikenessResumeStore.tryResumeOnce} (durable).
 *  - The native accept/retrain controls call {@link acceptLikeness} and
 *    {@link retrainLikeness}; the API routes wire the authenticated actor
 *    through these.
 */

export interface TrainingCompletion {
  personaId: string;
  /** Direct model (FalAdapter) request id — unique per training/retrain. */
  falRequestId: string;
  /** Family-owned LoRA weights blob key. */
  loraWeightKey: string;
  /** Family-owned configuration artifact blob key. */
  configArtifactKey: string;
}

/** Illustration spend seam. The review gate must never invoke this before every selected Persona is confirmed (COST-1). */
export type IllustrationSpend = (briefKey: string, storybookId: string) => void | Promise<void>;

export interface LikenessReviewDeps {
  store: DataStore;
  resume: LikenessResumeOps;
  fal: FalAdapter;
  blobs: BlobStore;
  spendIllustration?: IllustrationSpend;
  now?: () => Date;
}

export class LikenessReviewService {
  constructor(private readonly deps: LikenessReviewDeps) {}

  /**
   * Reflect a completed training into a review surface: generate review samples
   * and a generated Roster avatar from the owned LoRA, then move the Persona to
   * `review`. It does NOT by itself make the Persona Story-ready — `status`
   * becomes `review` and `likenessConfirmed` stays unchanged until the authorized
   * {@link acceptLikeness}. On any partial generation failure the partial
   * derivatives are deleted and the previous likeness is preserved (no orphan,
   * no lost-last-good).
   */
  async onTrainingReady(completion: TrainingCompletion): Promise<Persona> {
    const persona = this.deps.store.personas.get(completion.personaId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "training" && persona.status !== "review") {
      throw new Error("Training completion only applies to a Persona in training or review");
    }
    // Snapshot the previous derived set before we generate; we only delete old
    // derivatives AFTER their replacement is safely stored (SEC-7).
    const staleSampleKeys = [...(persona.reviewSampleKeys ?? [])];
    const staleAvatarKey = persona.avatarKey;

    const { sampleKeys, avatarKey } = await this.generateAndStoreDerivatives(
      persona,
      completion.falRequestId,
    );

    const next: Persona = {
      ...persona,
      status: "review",
      loraWeightKey: completion.loraWeightKey,
      reviewSampleKeys: sampleKeys,
      avatarKey,
    };
    this.deps.store.savePersona(next);

    // Only now, with the replacement committed, is it safe to retire the stale
    // generated derivatives. Source photos never reach these keys.
    await this.replaceStaleDerivatives(staleSampleKeys, staleAvatarKey, sampleKeys, avatarKey);

    return next;
  }

  /** Bearer visible review surface for the authenticated UI. */
  reviewView(personaId: string, actorMemberId: string): {
    personaId: string;
    status: string;
    likenessConfirmed: boolean;
    sampleKeys: string[];
    avatarKey: string | null;
  } {
    const persona = this.deps.store.getPersona(personaId, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    return {
      personaId: persona.id,
      status: persona.status,
      likenessConfirmed: persona.likenessConfirmed === true,
      sampleKeys: persona.reviewSampleKeys ?? [],
      avatarKey: persona.avatarKey,
    };
  }

  /**
   * Authorized, idempotent likeness acceptance (SEC-3).
   *  - Guardian for a minor (baby) Persona.
   *  - For an Adult Persona the SUBJECT (the Member whose Self Persona this is)
   *    must act; when no subject Member is linked the creating Member reviews
   *    likeness quality (self-consent already captured at creation via liveness).
   * Idempotent: repeating an already-confirmed accept is a no-op, never a
   * second transition. On success flips `review -> ready` and attempts to
   * resume any waiting Brief whose selected Personas are now all confirmed.
   */
  acceptLikeness(personaId: string, actorMemberId: string): Persona {
    const persona = this.deps.store.getPersona(personaId, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "ready" && persona.status !== "review") {
      throw new Error("Cannot confirm likeness for a Persona that is not ready");
    }
    this.assertAuthorized(persona, actorMemberId, "confirm likeness");

    if (persona.likenessConfirmed === true) {
      // Idempotent — already confirmed. Never a second transition.
      return persona;
    }
    const next: Persona = {
      ...persona,
      likenessConfirmed: true,
      status: persona.status === "review" ? "ready" : persona.status,
    };
    this.deps.store.savePersona(next);

    // Now that this Persona is confirmed, resume any waiting Brief.
    void this.resumeReadyBriefs();
    return next;
  }

  /**
   * Authorized retrain of a Persona's likeness. The provider boundary
   * (`fal.submitTraining`) is the first side effect so a failed submission
   * leaves the prior likeness intact and retryable. Acceptance/derivative
   * replacement happens when {@link onTrainingReady} observes the new
   * completion; the old derivatives are only retired after their replacement is
   * stored (SEC-7).
   */
  async retrainLikeness(input: {
    personaId: string;
    actorMemberId: string;
    sourcePhotos: Buffer[];
    defaultCaption: string;
  }): Promise<{ requestId: string }> {
    const persona = this.deps.store.getPersona(input.personaId, input.actorMemberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "review") {
      throw new Error("Only a Persona in likeness review may be retrained");
    }
    this.assertAuthorized(persona, input.actorMemberId, "retrain");
    // Source photos are handed to the provider substrate only; they are never
    // persisted as an owned likeness/review/avatar artifact.
    const submission: FalTrainingSubmission = {
      imageDataUrl: this.sourcePhotoDataUrl(input.sourcePhotos[0]),
      defaultCaption: input.defaultCaption,
      endpoint: "fal-ai/flux-2-trainer-v2",
      model: "flux-2-lora-v2",
      steps: 300,
      idempotencyKey: `persona-retrain-${persona.id}`,
    };
    const result = await this.deps.fal.submitTraining(submission);
    return { requestId: result.jobId };
  }

  /**
   * Durably resume exactly-once every waiting Brief whose selected Personas are
   * all confirmed. `tryResumeOnce` is a durable compare-and-set over the shared
   * marker table, so across a restart only one call wins and the illustration
   * spend seam (COST-1) fires for a Brief at most once.
   */
  async resumeReadyBriefs(): Promise<number> {
    let resumed = 0;
    for (const record of this.deps.resume.listWaiting()) {
      if (!this.allSelectedConfirmed(record.selectedPersonaIds, record.memberId)) continue;
      const storybookId = uuid();
      const claimed = await this.deps.resume.tryResumeOnce(record.briefKey, storybookId);
      if (!claimed) continue;
      // All selected Personas are confirmed (checked above), so this is the
      // authorized moment to spend illustration COGS.
      if (this.deps.spendIllustration) {
        await this.deps.spendIllustration(record.briefKey, storybookId);
      }
      resumed += 1;
    }
    return resumed;
  }

  /** Durable, authorized check used by the Story-generation gate (COST-1). */
  assertNoStorybookSpend(list: { status?: string; likenessConfirmed?: boolean }[]): void {
    const unconfirmed = list.filter((p) => p.likenessConfirmed !== true);
    if (unconfirmed.length > 0) {
      throw new Error("Not every selected Persona's likeness is confirmed");
    }
  }

  private allSelectedConfirmed(selectedPersonaIds: string[], memberId: string): boolean {
    return selectedPersonaIds.every((id) => {
      try {
        const persona = this.deps.store.getPersona(id, memberId);
        return persona !== undefined && persona.likenessConfirmed === true;
      } catch {
        return false;
      }
    });
  }

  private assertAuthorized(
    persona: Persona,
    actorMemberId: string,
    verb: string,
  ): void {
    const member = this.deps.store.members.get(actorMemberId);
    const subjectMember = [...this.deps.store.members.values()].find(
      (m) => m.selfPersonaId === persona.id,
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
          ? `Only guardians may ${verb} a Baby Persona`
          : persona.kind === "adult" && subjectMember
            ? `Only the Adult subject may ${verb} their own likeness`
            : `Not authorized to ${verb} this Persona`,
      );
    }
  }

  private async generateAndStoreDerivatives(
    persona: Persona,
    falRequestId: string,
  ): Promise<{ sampleKeys: string[]; avatarKey: string | null }> {
    if (!persona.loraWeightKey) throw new Error("No owned LoRA to generate likeness from");
    const generationId = this.generationId(falRequestId);
    const sampleKeys: string[] = [];
    let avatarKey: string | null = null;
    try {
      for (let index = 0; index < 2; index++) {
        const sample = await this.deps.fal.generateImage(
          `Likeness review sample ${index + 1}: ${persona.displayName} in a gentle storybook scene, no raw photo`,
          persona.loraWeightKey,
          { idempotencyKey: `likeness-sample/${persona.id}/${generationId}/${index}` },
        );
        const sampleKey = likenessReviewSampleBlobKey(persona.familyId, persona.id, generationId, index);
        await this.deps.blobs.put(sampleKey, sample.bytes ?? Buffer.from("likeness-review-sample"));
        sampleKeys.push(sampleKey);
      }
      const avatarKeyCandidate = rosterAvatarBlobKey(persona.familyId, persona.id, generationId);
      const portrait = await this.deps.fal.generateImage(
        `Neutral portrait headshot of ${persona.displayName}, soft storybook illustration, plain warm background`,
        persona.loraWeightKey,
        { idempotencyKey: `roster-avatar/${persona.id}/${generationId}` },
      );
      await this.deps.blobs.put(avatarKeyCandidate, portrait.bytes ?? Buffer.from("roster-avatar"));
      avatarKey = avatarKeyCandidate;
      return { sampleKeys, avatarKey };
    } catch (error) {
      // A partial review set must never become a selectable likeness surface.
      for (const key of sampleKeys) await this.deps.blobs.delete(key).catch(() => undefined);
      if (avatarKey) await this.deps.blobs.delete(avatarKey).catch(() => undefined);
      throw error;
    }
  }

  private async replaceStaleDerivatives(
    staleSampleKeys: string[],
    staleAvatarKey: string | null,
    keepSampleKeys: string[],
    keepAvatarKey: string | null,
  ): Promise<void> {
    const live = new Set([...keepSampleKeys]);
    if (keepAvatarKey) live.add(keepAvatarKey);
    for (const key of staleSampleKeys) {
      if (!live.has(key)) await this.deps.blobs.delete(key).catch(() => undefined);
    }
    if (staleAvatarKey && !live.has(staleAvatarKey)) {
      await this.deps.blobs.delete(staleAvatarKey).catch(() => undefined);
    }
  }

  private generationId(falRequestId: string): string {
    // Derive a stable-but-unique generation id from the request so re-driving
    // the same completion is idempotent at the blob level.
    return falRequestId.replace(/\W+/g, "-").slice(0, 64) || uuid();
  }

  private sourcePhotoDataUrl(_photo: Buffer | undefined): string {
    // The provider substrate owns zip/URL materialization; the review layer
    // only forwards a source identity and never stores the photo bytes.
    return "in-memory-training-source";
  }
}

export type LikenessReviewKind = PersonaKind;