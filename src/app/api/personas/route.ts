import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { castLimitError, castSlotInfo } from "@/lib/cast-limits";
import type { RequestContext } from "@/lib/context";

function filesFrom(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File);
}

async function stageFile(
  ctx: RequestContext,
  key: string,
  file: File
): Promise<void> {
  await ctx.blobs.put(key, Buffer.from(await file.arrayBuffer()));
}

/** Bearer-authed native Persona creation. Used by the Expo paid app. */
export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    try {
      if (!ctx.subscriptions.isActive(member.familyId)) {
        return jsonError(
          "Illustrated family members need an active subscription. Start with a free Character instead.",
          402
        );
      }

      const slots = castSlotInfo(ctx.subscriptions, ctx.store, member.familyId, member.id);
      if (!slots.canAdd) {
        return jsonError(castLimitError(slots.subscribed), 400);
      }

      const formData = await request.formData();
      const mode = String(formData.get("mode") ?? "adult") as "adult" | "baby";
      const displayName = String(formData.get("displayName") ?? "").trim();
      const photos = filesFrom(formData, "photos");
      const selfie = formData.get("selfie");

      if (mode !== "adult" && mode !== "baby") return jsonError("Unknown Persona kind", 400);
      if (!displayName) return jsonError("Name is required", 400);
      if (photos.length < 3) return jsonError("At least 3 photos required", 400);
      if (mode === "adult" && !(selfie instanceof File)) {
        return jsonError("A selfie is required to verify your own likeness", 400);
      }
      if (mode === "baby") {
        const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
        if (!gate.allowed) return jsonError(gate.reason ?? "Not allowed", 403);
      }

      const stagingId = randomUUID();
      const photoKeys: string[] = [];
      for (let i = 0; i < photos.length; i++) {
        const key = `staging/${member.familyId}/${stagingId}/photo-${i}.jpg`;
        await stageFile(ctx, key, photos[i]);
        photoKeys.push(key);
      }

      let selfieKey: string | undefined;
      if (mode === "adult" && selfie instanceof File) {
        selfieKey = `staging/${member.familyId}/${stagingId}/selfie.jpg`;
        await stageFile(ctx, selfieKey, selfie);
      }

      ctx.workflow.requestPersonaCreate({
        mode,
        memberId: member.id,
        displayName,
        photoKeys,
        selfieKey,
      });
      await ctx.persist();

      return jsonOk({ queued: true }, 202);
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
