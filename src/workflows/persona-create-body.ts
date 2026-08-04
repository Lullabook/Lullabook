import type { createRequestContext } from "@/lib/context";
import type { PersonaCreatePayload } from "@/adapters/types";
import type { Persona } from "@/domain/types";

export type { PersonaCreatePayload };

type RequestContext = ReturnType<typeof createRequestContext>;

/** Shared persona-create logic for Inngest functions and local dev workflow. */
export async function runPersonaCreateBody(
  ctx: RequestContext,
  payload: PersonaCreatePayload
): Promise<void> {
  const member = ctx.store.members.get(payload.memberId);

  const photos: Buffer[] = [];
  for (const key of payload.photoKeys) {
    const bytes = await ctx.blobs.get(key);
    if (!bytes) throw new Error(`Staged photo missing: ${key}`);
    photos.push(bytes);
  }
  const selfie = payload.selfieKey
    ? ((await ctx.blobs.get(payload.selfieKey)) ?? undefined)
    : undefined;
  let createdPersona: Persona | undefined;

  try {
    if (payload.mode === "promote-character") {
      await ctx.characters.promoteToPersona({
        characterId: payload.characterId!,
        memberId: payload.memberId,
        kind: payload.kind ?? "baby",
        photos,
        selfie,
      });
    } else if (payload.mode === "adult") {
      createdPersona = await ctx.personas.createAdult({
        memberId: payload.memberId,
        displayName: payload.displayName,
        photos,
        selfie,
      });
    } else {
      createdPersona = await ctx.personas.createBaby({
        memberId: payload.memberId,
        displayName: payload.displayName,
        photos,
      });
    }

    // This workflow predates the reservation/outbox/callback protocol. It may
    // still be invoked by a stale event, but its local completion must never
    // report a Story-ready Persona. The durable production path is
    // `runPersonaCreationActionBoundary` -> finalized outbox -> signed callback.
    if (createdPersona) {
      createdPersona.status = "failed";
      createdPersona.likenessConfirmed = false;
      createdPersona.failureReason = "Legacy Persona creation workflow is disabled";
      ctx.store.savePersona(createdPersona);
      throw new Error("Legacy Persona creation workflow is disabled; use the durable creation protocol");
    }
  } catch (err) {
    const failedPersona = [...ctx.store.personas.values()].find(
      (p) =>
        p.createdByMemberId === payload.memberId &&
        p.displayName === payload.displayName &&
        p.status === "training"
    );
    if (failedPersona && failedPersona.status !== "failed") {
      failedPersona.status = "failed";
      failedPersona.likenessConfirmed = false;
      failedPersona.failureReason = "Legacy Persona creation workflow failed";
      ctx.store.savePersona(failedPersona);
    }
    for (const key of [...payload.photoKeys, payload.selfieKey ?? ""]) {
      if (key) await ctx.blobs.delete(key);
    }
    if (member) {
      await ctx.notifications.sendEmail(
        member.email,
        "We couldn't create your character",
        err instanceof Error ? err.message : "Something went wrong."
      );
    }
    await ctx.persist();
    throw err;
  }

  for (const key of [...payload.photoKeys, payload.selfieKey ?? ""]) {
    if (key) await ctx.blobs.delete(key);
  }
  await ctx.persist();
}
