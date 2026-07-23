import { NextResponse } from "next/server";
import { withBearerAuth, jsonError, jsonOk, jsonDomainError } from "@/lib/api-route";

function filesFrom(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File);
}

/** Bearer-authenticated likeness replacement/retraining boundary. */
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
      const replacement = await ctx.personas.replacePhotos({
        personaId: id,
        memberId: member.id,
        photos: await Promise.all(photos.map(async (photo) => Buffer.from(await photo.arrayBuffer()))),
        selfie: selfie instanceof File ? Buffer.from(await selfie.arrayBuffer()) : undefined,
      });
      await ctx.persist();
      return jsonOk({ queued: replacement.status === "training" }, 202);
    } catch (error) {
      return jsonDomainError(error, 400);
    }
  });
}
