import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { withBearerAuth, jsonError, jsonOk, jsonDomainError } from "@/lib/api-route";
import { SupabasePersonaTrainingLifecycleRepository } from "@/db/persona-training-lifecycle";
import { createBearerClient } from "@/lib/supabase";
import { FalLoraTrainingService } from "@/services/fal-lora-training";

function filesFrom(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File);
}

/**
 * Bearer-authenticated likeness replacement/retraining boundary (ticket 188).
 *
 * A Persona in `review` is durably moved back to `training` through the
 * authenticated SQL RPC (subject/Guardian authority + `review` state enforced
 * in one transaction), after the byte gates — liveness (Adult, jurisdiction-
 * configured), moderation, and preflight — pass. The replacement training job
 * is submitted through the same durable Fal submission seam; its signed
 * callback regenerates review samples and moves the Persona back to `review`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const persona = ctx.store.getPersona(id, member.id);
      if (!persona) return jsonError("Persona not found", 404);
      const formData = await request.formData();
      const photos = filesFrom(formData, "photos");
      const selfie = formData.get("selfie");
      if (photos.length < 3) return jsonError("At least 3 photos required", 400);

      const buffers = await Promise.all(
        photos.map(async (photo) => Buffer.from(await photo.arrayBuffer())),
      );
      const selfieBuf = selfie instanceof File
        ? Buffer.from(await selfie.arrayBuffer())
        : undefined;

      // Byte gates + in-memory authority/state checks (parity with the SQL RPC).
      await ctx.personas.retrainForReview({
        personaId: id,
        memberId: member.id,
        photos: buffers,
        selfie: selfieBuf,
      });

      // Durable, authoritative `review -> training`; another Member cannot
      // invoke it (SQL enforces subject/Guardian ownership).
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.slice("Bearer ".length).trim();
      if (!token) return jsonError("Missing bearer token", 401);
      const repository = new SupabasePersonaTrainingLifecycleRepository(createBearerClient(token));
      await repository.transitionReviewToTraining(id);

      // Submit the replacement training job; its signed callback returns the
      // Persona to `review` with fresh Family-owned samples.
      const training = new FalLoraTrainingService(ctx.store, ctx.fal, ctx.blobs);
      await training.submit({
        familyId: persona.familyId,
        personaId: persona.id,
        images: buffers.map((bytes, index) => ({
          filename: `photo-${index}.jpg`,
          bytes,
          moderated: true,
        })),
        defaultCaption: `a family member named ${persona.displayName}`,
        idempotencyKey: `persona-retraining:${persona.id}:${createHash("sha256")
          .update(Buffer.concat(buffers))
          .digest("hex")
          .slice(0, 24)}`,
      });

      await ctx.persist();
      return jsonOk({ queued: true, personaId: id }, 202);
    } catch (error) {
      return jsonDomainError(error, 400);
    }
  });
}
