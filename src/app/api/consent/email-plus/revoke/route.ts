import { NextResponse } from "next/server";
import { createRequestContext } from "@/lib/context";
import { EmailPlusVpcService } from "@/services/email-plus-vpc";
import { optionalEnv } from "@/adapters/env";

export async function POST(request: Request): Promise<NextResponse> {
  const { token } = (await request.json()) as { token: string };
  const ctx = createRequestContext();
  const appUrl = optionalEnv("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
  const vpc = new EmailPlusVpcService(ctx.store, ctx.notifications, appUrl);
  try {
    vpc.revokeConsent(token);
    await ctx.persist();
    return NextResponse.json({ status: "revoked" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
