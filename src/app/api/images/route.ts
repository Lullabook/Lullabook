import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";

/**
 * Signed-URL resolver: Pages store Family-scoped blob keys, never provider
 * URLs (PRD v2). The key's `books/{familyId}/` prefix must match the
 * caller's own Family — per-Family isolation at the serving layer too.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key" }, { status: 400 });
  }
  const authed = await resolveRequestAuth(req);
  if (!authed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!key.startsWith(`books/${authed.member.familyId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Issue 122 (red-team BUG 5): only serve actual illustration/video page blobs.
  // The page pipeline also writes diagnostic siblings (`.error`, `.moderation`,
  // `.raw`) under the same `books/{familyId}/` prefix; those are internal —
  // never client-servable (they carry raw fal error text / pre-moderation bytes).
  const isServableBlob = /\.(png|jpg|jpeg|webp|mp4)$/i.test(key);
  if (!isServableBlob) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = await authed.ctx.blobs.signedUrl(key);
  return NextResponse.redirect(url, 307);
}
