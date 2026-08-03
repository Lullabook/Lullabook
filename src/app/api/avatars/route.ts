import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";
import { isRosterAvatarKey } from "@/lib/roster-avatar";

/**
 * Roster avatar resolver (ADR-0020): serves generated portraits only — never raw
 * reference photos. Keys must be Family-scoped under `avatars/{familyId}/`.
 *
 * Issue 192: the lookup is minimal (member row only — just enough for the
 * Family prefix check), responses are `Cache-Control: private` (never public),
 * and a failed signed URL degrades to a 404 so a client can fall back once to
 * its placeholder instead of looping on a 500.
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
  if (!isRosterAvatarKey(key, authed.member.familyId)) {
    return privateCache(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
  }
  const signed = authed.ctx.blobs.signedUrl;
  if (!signed) {
    return privateCache(NextResponse.json({ error: "Not configured" }, { status: 500 }));
  }
  try {
    const url = await signed(key);
    return privateCache(NextResponse.redirect(url, 307));
  } catch {
    // Issue 192: a broken/missing avatar must not 500-loop the roster — a
    // private 404 lets the client show its placeholder exactly once.
    return privateCache(NextResponse.json({ error: "Avatar unavailable" }, { status: 404 }));
  }
}
