import type { FalAdapter, BlobStore } from "@/adapters/types";
import { FalLoraTrainingService } from "@/services/fal-lora-training";
import type { DataStore } from "@/db/store";

export interface PersonaCreationFinalizedPayload {
  eventId: string;
  familyId: string;
  personaId: string;
  reservationId: string;
}

export interface PersonaCreationFinalizedContext {
  store: DataStore;
  blobs: BlobStore;
  fal: FalAdapter;
}

/**
 * The outbox consumer is the only production path that submits Persona
 * training. Its provider key is derived from the immutable outbox event, so a
 * crash before local persistence safely repeats the same Fal request.
 */
export async function runPersonaCreationFinalizedBody(
  ctx: PersonaCreationFinalizedContext,
  payload: PersonaCreationFinalizedPayload,
  photoKeys: string[],
): Promise<void> {
  const persona = ctx.store.personas.get(payload.personaId);
  if (!persona || persona.familyId !== payload.familyId) {
    throw new Error("Finalized Persona creation is not available to the workflow");
  }
  const photos = await Promise.all(
    photoKeys.map(async (key) => {
      const bytes = await ctx.blobs.get(key);
      if (!bytes) throw new Error("Finalized Persona source photo is unavailable");
      return bytes;
    }),
  );
  const training = new FalLoraTrainingService(ctx.store, ctx.fal, ctx.blobs);
  await training.submit({
    familyId: payload.familyId,
    personaId: payload.personaId,
    images: photos.map((bytes, index) => ({
      filename: `photo-${index}.jpg`,
      bytes,
      moderated: true,
    })),
    defaultCaption: `a family member named ${persona.displayName}`,
    idempotencyKey: `persona-creation-training:${payload.eventId}`,
  });
}
