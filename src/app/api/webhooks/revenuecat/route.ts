import { NextResponse } from "next/server";
import { RevenueCatWebhookHandler } from "@/adapters/revenuecat";
import { createRequestContext } from "@/lib/context";
import { optionalEnv } from "@/adapters/env";

export async function POST(request: Request): Promise<NextResponse> {
  const payload = await request.text();
  const signature = request.headers.get("authorization");
  const secret = optionalEnv("REVENUECAT_WEBHOOK_SECRET") ?? "";

  const handler = new RevenueCatWebhookHandler(createRequestContext().subscriptions, {
    verify: (_body, sig) => !!secret && sig === `Bearer ${secret}`,
  });

  const result = handler.handle(payload, signature);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }
  await createRequestContext().persist();
  return NextResponse.json({ received: true });
}
