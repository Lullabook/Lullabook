import { NextResponse } from "next/server";
import { resolveRequestAuth } from "@/lib/request-auth";
import { isRosterAvatarKey } from "@/lib/roster-avatar";

/**
 * Roster avatar resolver (ADR-0020): serves generated portraits only — never raw
 * reference photos. Keys must be Family-scoped under `avatars/{familyId}/`.
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
  if (!isRosterAvatarKey(key, authed.member.familyId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const signed = authed.ctx.blobs.signedUrl;
  if (!signed) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const url = await signed(key);
  return NextResponse.redirect(url, 307);
}
