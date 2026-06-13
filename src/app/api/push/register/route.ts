import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { InMemoryPushSubscriptionStore } from "@/adapters/push-store";

export async function POST(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const { expoPushToken } = (await request.json()) as { expoPushToken: string };
    const store = new InMemoryPushSubscriptionStore(ctx.store);
    const sub = await store.registerToken(member.id, expoPushToken);
    await ctx.persist();
    return jsonOk({ id: sub.id });
  });
}
