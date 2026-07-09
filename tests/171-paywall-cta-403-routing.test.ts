import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestContext } from "@/test/fixtures";
import {
  ApiEntitlementError,
  ENTITLEMENT_CODES,
  classifyEntitlementError,
  isEntitlementError,
} from "../mobile/lib/entitlement-error";

/**
 * Issue 171 — Paywall CTA wired to the PurchaseController seam + typed 403
 * entitlement routing (SEC-1, SEC-4, FAIL-2, D5).
 *
 * Server half: gated routes must put the machine entitlement code on the
 * wire (403 + `code`), because the client routes on the CODE — never on
 * message sniffing, and never on a local entitlement decision.
 *
 * Client half: `classifyEntitlementError` only recognizes a 403 with a known
 * code; everything else stays a plain error (non-entitlement 403s are never
 * hijacked into the paywall).
 */

const harness = vi.hoisted(() => ({
  ctx: null as ReturnType<typeof createTestContext> | null,
  authSub: "guardian",
}));

vi.mock("@/lib/context", () => ({
  createRequestContext: () => harness.ctx!,
}));

vi.mock("@/lib/supabase-jwt", () => ({
  createSupabaseJwtVerifier: () => ({
    verify: async () => ({
      sub: harness.authSub,
      email: `${harness.authSub}@example.com`,
      jurisdiction: "US",
    }),
  }),
}));

import { POST as createStorybookRoute } from "@/app/api/storybooks/route";

function bearerRequest(body: unknown): Request {
  return new Request("http://localhost/api/storybooks", {
    method: "POST",
    headers: {
      Authorization: "Bearer good",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function read(rel: string): string {
  return readFileSync(path.join(__dirname, "..", rel), "utf8");
}

describe("171 — server puts the entitlement code on the wire (SEC-1)", () => {
  beforeEach(() => {
    harness.ctx = createTestContext();
    harness.authSub = "guardian";
  });

  it("unentitled Storybook create → 403 with machine code, no local unlock possible", async () => {
    const ctx = harness.ctx!;
    const guardian = ctx.onboarding.ensureFamilyForNewUser("guardian", "g@example.com");
    expect(ctx.subscriptions.isActive(guardian.familyId)).toBe(false);

    const res = await createStorybookRoute(
      bearerRequest({ starringPersonaIds: [], theme: "The first snow", storyType: "bedtime" })
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("not_entitled");
    expect(typeof body.error).toBe("string");

    // The wire shape round-trips into the typed client error.
    const typed = classifyEntitlementError(res.status, body);
    expect(typed).toBeInstanceOf(ApiEntitlementError);
    expect(typed?.code).toBe("not_entitled");
    expect(isEntitlementError(typed)).toBe(true);
  });

  it("jsonDomainError never leaks third-party status/code shapes (Postgrest etc.)", async () => {
    const { jsonDomainError } = await import("@/lib/api-route");

    // A PostgrestError-shaped object: has code + status but is NOT a domain error.
    const leaky = Object.assign(new Error("relation \"secret_table\" does not exist"), {
      code: "PGRST116",
      status: 406,
    });
    const res = jsonDomainError(leaky, 400);
    expect(res.status).toBe(400); // fallback, not the foreign status
    const body = await res.json();
    expect(body.code).toBeUndefined(); // internal code never crosses the wire

    // Whitelisted domain codes still pass through untouched.
    const domain = Object.assign(new Error("An active subscription is required."), {
      code: "not_entitled",
      status: 403,
    });
    const ok = jsonDomainError(domain, 400);
    expect(ok.status).toBe(403);
    expect((await ok.json()).code).toBe("not_entitled");
  });
});

describe("171 — client classification is code-gated, never message-sniffed", () => {
  it("recognizes every known entitlement code on a 403", () => {
    for (const code of ENTITLEMENT_CODES) {
      const err = classifyEntitlementError(403, { error: "nope", code });
      expect(err).toBeInstanceOf(ApiEntitlementError);
      expect(err?.code).toBe(code);
      expect(err?.message).toBe("nope");
    }
  });

  it("never hijacks non-entitlement 403s (unknown code, missing code, junk body)", () => {
    expect(classifyEntitlementError(403, { error: "csrf", code: "csrf_rejected" })).toBeNull();
    expect(classifyEntitlementError(403, { error: "not a member" })).toBeNull();
    expect(classifyEntitlementError(403, null)).toBeNull();
    expect(classifyEntitlementError(403, "forbidden")).toBeNull();
    expect(classifyEntitlementError(403, { code: 42 })).toBeNull();
  });

  it("only 403 counts — same code on other statuses stays a plain error", () => {
    for (const status of [200, 400, 401, 402, 500]) {
      expect(classifyEntitlementError(status, { error: "x", code: "not_entitled" })).toBeNull();
    }
  });

  it("isEntitlementError rejects plain errors and non-errors", () => {
    expect(isEntitlementError(new Error("subscription required"))).toBe(false);
    expect(isEntitlementError("not_entitled")).toBe(false);
    expect(isEntitlementError(null)).toBe(false);
  });
});

describe("171 — mobile surfaces wired to the seam (source contract)", () => {
  it("apiFetch classifies 403s through the typed helper", () => {
    const src = read("mobile/lib/api.ts");
    expect(src).toContain("classifyEntitlementError");
  });

  it("D5: paywall CTA drives PurchaseController.startTrial — not a bare dismiss", () => {
    const src = read("mobile/app/billing.tsx");
    expect(src).toContain("getPurchaseController().startTrial()");
    // FAIL-2: failure surfaces a retryable inline error and stays on the paywall.
    expect(src).toContain("setTrialError(result.error)");
    expect(src).not.toContain('onPress={() => router.dismiss()}');
    // FAIL-1: static fallback plans still keep the screen renderable.
    expect(src).toContain("FALLBACK_PLANS");
  });

  it("SEC-4: create screen routes typed entitlement errors to /billing", () => {
    const src = read("mobile/app/(tabs)/create/index.tsx");
    expect(src).toContain("isEntitlementError(e)");
    expect(src).toContain('router.push("/billing"');
  });
});
