import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk } from "@/lib/api-route";

export async function GET(request: Request): Promise<NextResponse> {
  return withBearerAuth(request, async (ctx, member) => {
    const members = ctx.store.getMembersByFamily(member.familyId);
    const sub = ctx.store.getSubscription(member.familyId);
    return jsonOk({
      members: members.map((m) => ({
        id: m.id,
        email: m.email,
        role: m.role,
      })),
      jurisdiction: member.jurisdiction,
      subscriptionStatus: sub?.status ?? "none",
      subscriptionActive: ctx.subscriptions.isActive(member.familyId),
    });
  });
}
