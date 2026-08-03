import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";

function isSafeBlobKey(key: string): boolean {
  return (
    !key.includes("\\") &&
    !key.includes("..") &&
    !/[\u0000-\u001f\u007f]/.test(key) &&
    key.split("/").every((segment) => segment.length > 0 && segment !== ".")
  );
}

/**
 * Signed-URL resolver: Pages store Family-scoped blob keys, never provider
 * URLs (PRD v2). The key's `books/{familyId}/` prefix must match the
 * caller's own Family — per-Family isolation at the serving layer too.
 *
 * Issue 192: the auth lookup is minimal (member row only — the route needs
 * nothing but the Family boundary), and every response is `Cache-Control:
 * private` — child-family images are never public-cacheable.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const privateCache = (res: NextResponse) => {
    res.headers.set("Cache-Control", "private");
    return res;
  };

  const key = new URL(req.url).searchParams.get("key");
  if (!key) {
    return privateCache(NextResponse.json({ error: "Missing key" }, { status: 400 }));
  }
  const authed = await resolveRequestAuth(req, "minimal");
  if (!authed) {
    return privateCache(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  }
  if (!isSafeBlobKey(key) || !key.startsWith(`books/${authed.member.familyId}/`)) {
    return privateCache(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  // Issue 122 (red-team BUG 5): only serve actual illustration/video page blobs.
  // The page pipeline also writes diagnostic siblings (`.error`, `.moderation`,
  // `.raw`) under the same `books/{familyId}/` prefix; those are internal —
  // never client-servable (they carry raw fal error text / pre-moderation bytes).
  const isServableBlob = /\.(png|svg|jpg|jpeg|webp|mp4)$/i.test(key);
  if (!isServableBlob) {
    return privateCache(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  try {
    const url = await authed.ctx.blobs.signedUrl(key);
    return privateCache(NextResponse.redirect(url, 307));
  } catch {
    return privateCache(NextResponse.json({ error: "Image unavailable" }, { status: 404 }));
  }
}
