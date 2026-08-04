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
  const stringValue = (...values: unknown[]) => values.find(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  )?.trim();
  const numberValue = (...values: unknown[]) => values.find(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  const type = stringValue(source.type)?.toUpperCase() ?? "";
  const appUserId = stringValue(source.app_user_id) ?? "";
  const eventId = stringValue(source.id, source.event_id) ?? "";
  const purchasedAtMs = numberValue(source.purchased_at_ms, source.event_timestamp_ms);
  const productId = stringValue(source.new_product_id, source.product_id);
  const subscriptionId = stringValue(source.original_transaction_id, source.transaction_id);
  const periodType = stringValue(source.period_type)?.toUpperCase();
  return {
    eventId,
    type,
    appUserId,
    productId,
    subscriptionId,
    expirationAtMs: numberValue(source.expiration_at_ms),
    eventTimestampMs: purchasedAtMs,
    isTrial: periodType === "TRIAL",
    entitlementIds: Array.isArray(source.entitlement_ids)
      ? source.entitlement_ids
        .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
        .map((id) => id.trim())
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

  const result = await ctx.revenuecatPurchases.handleWebhookEvent(event);
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
