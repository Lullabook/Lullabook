import { NextResponse } from "next/server";
import { withBearerAuth, jsonError } from "@/lib/api-route";
import { isLikenessReviewSampleKey } from "@/lib/roster-avatar";

/** Bearer-authenticated resolver for generated likeness-review samples only. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const persona = ctx.store.getPersona(id, member.id);
    if (!persona) return jsonError("Persona not found", 404);
    const key = new URL(request.url).searchParams.get("key");
    if (!key) {
      return NextResponse.json({
        samples: (persona.reviewSampleKeys ?? []).map(
          (sampleKey) => `/api/personas/${encodeURIComponent(id)}/likeness-samples?key=${encodeURIComponent(sampleKey)}`
        ),
      });
    }
    if (!isLikenessReviewSampleKey(key, member.familyId) || !(persona.reviewSampleKeys ?? []).includes(key)) {
      return jsonError("Review sample not found", 404);
    }
    const signed = await ctx.blobs.signedUrl(key);
    return NextResponse.redirect(signed, 307);
  });
}
