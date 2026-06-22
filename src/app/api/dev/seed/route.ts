import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";

/**
 * Issue 107 — Dev-only demo seed reachable from the native app.
 *
 * Double-gated (server-authoritative): `NODE_ENV !== "production"` AND
 * `DEV_DEMO_SEED === "true"`. Inert in production / without the flag — returns
 * 403 before any work runs. Mirrors the `DEV_FORCE_SUBSCRIPTION` guard pattern
 * and the existing `seedDemoWorldAction` (web server action). Idempotent —
 * `seedMayaWorldRuntime` bails if the Household already has storybooks.
 */
function isDevSeedEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_DEMO_SEED === "true"
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isDevSeedEnabled()) {
    return NextResponse.json(
      { error: "Demo seed is disabled" },
      { status: 403 }
    );
  }
  return withBearerAuth(request, async (ctx, member) => {
    try {
      const { seedMayaWorldRuntime } = await import("@/dev/seed-maya-world");
      const result = await seedMayaWorldRuntime(ctx, member);
      await ctx.persist();
      return jsonOk(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Seed failed";
      return jsonError(message, 400);
    }
  });
}
