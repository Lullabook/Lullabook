import { NextResponse } from "next/server";
import { SupabasePersonaCreationRepository } from "@/db/persona-creation-protocol";
import { withBearerAuth, jsonOk, jsonError, jsonDomainError } from "@/lib/api-route";
import { castLimitError, castSlotInfo } from "@/lib/cast-limits";
import { createBearerClient } from "@/lib/supabase";
import { runPersonaCreationActionBoundary } from "@/lib/actions";
import { personaCreationRequestFingerprint } from "@/services/production-persona-creation";

function filesFrom(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File);
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
      if (mode === "adult" && formData.get("selfConsent") !== "true") {
        return jsonError("Adult Personas require the subject's consent", 400);
      }
      if (mode === "adult" && !(selfie instanceof File)) {
        return jsonError("A selfie is required to verify your own likeness", 400);
      }
      if (mode === "baby") {
        const gate = ctx.subscriptions.canCreateBabyPersona(member.id);
        if (!gate.allowed) {
          // Issue 172: consent denials carry a machine code so the client can
          // route to the consent flow — never inferred from message text.
          if (gate.code === "consent_required") {
            return NextResponse.json(
              {
                error:
                  gate.reason ??
                  "Verified parental consent is required before creating a baby profile",
                code: "consent_required",
              },
              { status: 403 }
            );
          }
          return jsonError(gate.reason ?? "Not allowed", 403);
        }
      }

      // Keep source bytes in memory until preflight, liveness, and moderation
      // pass. The authenticated SQL reservation then owns the upload-scoped
      // blob keys and durable finalize/outbox boundary.
      const sourcePhotos = await Promise.all(
        photos.map(async (photo) => Buffer.from(await photo.arrayBuffer())),
      );
      const selfieBytes = selfie instanceof File
        ? Buffer.from(await selfie.arrayBuffer())
        : undefined;
      const creationInput = {
        kind: mode,
        displayName,
        photoCount: sourcePhotos.length,
        photos: sourcePhotos,
        selfie: selfieBytes,
        // C2/C4: the service seam denies missing subject self-consent and
        // applies the jurisdiction-configured liveness gate before staging.
        selfConsent: mode === "adult" ? formData.get("selfConsent") === "true" : undefined,
        jurisdiction: member.jurisdiction,
        ...(mode === "baby"
          ? {
              baby: { displayName },
              bond: {
                relationship: String(formData.get("relationship") ?? "").trim(),
                babyCallsThem: String(formData.get("babyCalls") ?? "").trim(),
                theyCallBaby: String(formData.get("theyCallBaby") ?? "").trim(),
              },
            }
          : {}),
      };
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.slice("Bearer ".length).trim();
      if (!token) return jsonError("Missing bearer token", 401);
      const repository = new SupabasePersonaCreationRepository(createBearerClient(token));
      await runPersonaCreationActionBoundary({
        creation: {
          ...creationInput,
          familyId: member.familyId,
          requestFingerprint: personaCreationRequestFingerprint(creationInput),
        },
        repository,
        worker: repository,
        blobs: ctx.blobs,
        childSafety: ctx.childSafety,
        liveness: ctx.liveness,
        workflow: ctx.workflow,
      });

      return jsonOk({ queued: true });
    } catch (err) {
      return jsonDomainError(err, 400);
    }
  });
}
