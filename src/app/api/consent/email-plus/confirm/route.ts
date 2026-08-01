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
    // The link is unauthenticated — the token is the only handle onto the
    // Family, so the store must be loaded from it before we can confirm.
    await ctx.store.hydrateByConsentToken(token);
    const receipt = vpc.confirmConsent(token);
    const req = [...ctx.store.emailPlusVpcRequests.values()].find((r) => r.token === token);
    if (req) await vpc.sendDelayedConfirmation(req.id);
    await ctx.persist();
    return NextResponse.json({ receiptId: receipt.id, status: "confirmed" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 }
    );
  }
}
