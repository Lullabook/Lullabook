import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { optionalEnv } from "@/adapters/env";

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const { email } = (await request.json()) as { email: string };
    const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
    const vpc = new EmailPlusVpcService(ctx.store, ctx.notifications, appUrl);
    try {
      const req = vpc.requestConsent(member.id, email);
      await vpc.sendConsentLink(req.id);
      await ctx.persist();
      return jsonOk({ requestId: req.id, status: "link_sent" });
    } catch (err) {
      return jsonError(err instanceof Error ? err.message : "Failed", 400);
    }
  });
}
