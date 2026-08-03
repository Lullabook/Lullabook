import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createRequestContext } from "@/lib/context";
import { optionalEnv } from "@/adapters/env";
import type { RevenueCatLifecycleEvent } from "@/adapters/types";

function validAuthorization(provided: string | null, secret: string | undefined): boolean {
  if (!provided || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(provided);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function normalizeEvent(body: Record<string, unknown>): RevenueCatLifecycleEvent {
  const source = (body.event && typeof body.event === "object" ? body.event : body) as Record<string, unknown>;
  const type = typeof source.type === "string" ? source.type.toUpperCase() : "";
  const appUserId = typeof source.app_user_id === "string" ? source.app_user_id : "";
  const eventId = source.id ?? source.event_id ?? source.transaction_id;
  const purchasedAtMs = source.purchased_at_ms ?? source.event_timestamp_ms;
  return {
    eventId: typeof eventId === "string" && eventId ? eventId : `${type}:${appUserId}`,
    type,
    appUserId,
    productId: typeof source.product_id === "string" ? source.product_id : undefined,
    subscriptionId:
      typeof source.original_transaction_id === "string"
        ? source.original_transaction_id
        : typeof source.transaction_id === "string"
          ? source.transaction_id
          : undefined,
    expirationAtMs: typeof source.expiration_at_ms === "number" ? source.expiration_at_ms : undefined,
    eventTimestampMs: typeof purchasedAtMs === "number" ? purchasedAtMs : undefined,
    isTrial: source.period_type === "TRIAL" || source.period_type === "trial",
    entitlementIds: Array.isArray(source.entitlement_ids)
      ? source.entitlement_ids.filter((id): id is string => typeof id === "string")
      : undefined,
  };
}

/** RevenueCat is the native billing callback; no client auth is involved. */
export async function POST(request: Request): Promise<NextResponse> {
  const payload = await request.text();
  const signature = request.headers.get("authorization");
  if (!validAuthorization(signature, optionalEnv("REVENUECAT_WEBHOOK_SECRET"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = normalizeEvent(body);
  if (!event.appUserId || !event.eventId || !event.type) {
    return NextResponse.json({ error: "Invalid RevenueCat lifecycle event" }, { status: 400 });
  }
  const ctx = createRequestContext();
  const store = ctx.store as typeof ctx.store & {
    hydrateByAuthUser?: (authUserId: string) => Promise<unknown>;
    hydrateFamily?: (familyId: string) => Promise<void>;
  };

  // Native builds use the Family id as app_user_id. Prefer that exact Family
  // binding before the auth-user fallback, preventing an ID collision from
  // attaching a webhook to another Family.
  if (store.hydrateFamily) await store.hydrateFamily(event.appUserId);
  if (!store.familyDataExists(event.appUserId) && store.hydrateByAuthUser) {
    await store.hydrateByAuthUser(event.appUserId);
  }

  const result = ctx.revenuecatPurchases.handleWebhookEvent(event);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Exactly one hydrated context owns the mutation and its durable write. Do
  // not create a second context after handling the event.
  await ctx.persist();
  return NextResponse.json({
    received: true,
    duplicate: result.duplicate,
    action: result.action ?? "ignored",
  });
}
