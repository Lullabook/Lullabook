import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ApiSignInRequiredError,
  CREATE_REQUEST_TIMEOUT_MS,
  CreateRequestTimeoutError,
  classifyGenerationError,
  isCreateRequestTimeout,
} from "../mobile/lib/generation-flow";
import { ApiConsentRequiredError, ApiEntitlementError } from "../mobile/lib/entitlement-error";

/**
 * Issue 187 — typed generation errors: raw provider/domain error text is
 * never rendered; every displayed failure has a typed retry or support
 * action; a create request stalled beyond 20 seconds surfaces a retry card
 * without freezing the Generate control.
 *
 * Mobile decision logic is pure + dependency-free (same pattern as
 * tests/170/173); the screens' wiring is pinned by source contract.
 */

const ROOT = process.cwd();
const readMobile = (p: string) => readFileSync(join(ROOT, "mobile", p), "utf8");

describe("187 — raw provider/domain error text never reaches the screen", () => {
  const rawProviderErrors = [
    "Claude outage: anthropic messages.create failed after retries",
    "fal HTTP 500: model_workers_unavailable for flux-lora",
    "connection refused: fal.ai timeout after 120000ms",
    "Supabase service error: insert into storybooks violated row-level security",
    "Anthropic API key invalid: 401 invalid x-api-key",
  ];

  for (const raw of rawProviderErrors) {
    it(`classifies "${raw.slice(0, 40)}…" to a typed failure that does not echo the raw text`, () => {
      const failure = classifyGenerationError(new Error(raw));
      // The raw provider/domain text must never appear in rendered copy.
      expect(failure.message).not.toContain(raw);
      expect(failure.message).not.toContain("Claude");
      expect(failure.message).not.toContain("fal");
      expect(failure.message).not.toContain("anthropic");
      expect(failure.message).not.toContain("API key");
      // …and it always carries a typed retry/support action.
      expect(["retry", "support", "sign-in", "paywall", "consent"]).toContain(failure.kind);
      expect(typeof failure.retryable).toBe("boolean");
    });
  }

  it("non-errors and plain strings fall back to a typed retryable failure", () => {
    for (const junk of [undefined, null, "some raw server text", 42]) {
      const failure = classifyGenerationError(junk);
      expect(failure.kind).toBe("retry");
      expect(failure.retryable).toBe(true);
      expect(failure.message).toMatch(/try again/i);
    }
  });
});

describe("187 — typed failure kinds drive typed actions", () => {
  it("entitlement (403 code) → paywall action", () => {
    const failure = classifyGenerationError(
      new ApiEntitlementError("not_entitled", "not_entitled")
    );
    expect(failure.kind).toBe("paywall");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/plan/i);
  });

  it("consent-required (403 code) → consent action", () => {
    const failure = classifyGenerationError(new ApiConsentRequiredError("consent_required"));
    expect(failure.kind).toBe("consent");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/consent/i);
  });

  it("401 sign-in → sign-in action, never an inline error card", () => {
    const failure = classifyGenerationError(new ApiSignInRequiredError());
    expect(failure.kind).toBe("sign-in");
    expect(failure.retryable).toBe(false);
  });

  it("404 not-found → support action (retrying cannot fix a missing book)", () => {
    const failure = classifyGenerationError(
      Object.assign(new Error("Not found"), { name: "ApiStatusError", status: 404 })
    );
    expect(failure.kind).toBe("support");
    expect(failure.retryable).toBe(false);
    expect(failure.message).toMatch(/no longer available/i);
  });

  it("a stalled create request (>20s) → typed retry action with a visible retry path", () => {
    expect(CREATE_REQUEST_TIMEOUT_MS).toBe(20_000);
    const failure = classifyGenerationError(new CreateRequestTimeoutError());
    expect(failure.kind).toBe("retry");
    expect(failure.retryable).toBe(true);
    expect(failure.message).toMatch(/try again/i);
  });

  it("isCreateRequestTimeout detects the timeout by typed name, never by message text", () => {
    const timeout = new CreateRequestTimeoutError();
    expect(isCreateRequestTimeout(timeout)).toBe(true);
    expect(isCreateRequestTimeout(new Error("Generation is taking longer than expected"))).toBe(false);
    expect(isCreateRequestTimeout("timeout")).toBe(false);
  });

  it("a 5xx server failure stays retryable with safe copy", () => {
    const failure = classifyGenerationError(
      Object.assign(new Error("Internal Server Error"), { name: "ApiStatusError", status: 500 })
    );
    expect(failure.kind).toBe("retry");
    expect(failure.retryable).toBe(true);
    expect(failure.message).toMatch(/try again/i);
  });
});

describe("187 — create-flow source contract: 20s timeout + retry card + control never frozen", () => {
  const src = readMobile("app/(tabs)/create/index.tsx");
  const api = readMobile("lib/api.ts");

  it("the create request is bounded by the 20s timeout constant", () => {
    // The bound lives at the wire call: createStorybook passes the constant
    // into apiFetch as its abort budget.
    const fnStart = api.indexOf("export function createStorybook(");
    expect(fnStart).toBeGreaterThan(-1);
    const fn = api.slice(fnStart, fnStart + 600);
    expect(fn).toContain("CREATE_REQUEST_TIMEOUT_MS");
  });

  it("the generate handler classifies errors (typed copy) instead of rendering raw messages", () => {
    expect(src).toContain("classifyGenerationError(");
    // Raw message-sniffing render path is gone from the generate handler.
    expect(src).not.toMatch(/setError\(message\.includes\("subscription"\)/);
  });

  it("a retryable failure renders a retry card with a visible Try-again action", () => {
    expect(src).toMatch(/error\.retryable/);
    expect(src).toMatch(/Try again/);
  });

  it("the Generate control is released in finally — a stalled request never freezes it", () => {
    // setGenerating(false) must run on every outcome, including a timeout.
    const generateFn = src.slice(src.indexOf("async function generate"), src.indexOf("if (loading)"));
    const finallyIdx = generateFn.indexOf("finally");
    expect(finallyIdx).toBeGreaterThan(-1);
    expect(generateFn.slice(finallyIdx)).toContain("setGenerating(false)");
  });
});

describe("187 — reader source contract: every displayed failure has a typed action", () => {
  const src = readMobile("app/(tabs)/stories/[id].tsx");

  it("the reader classifies errors and renders only typed failure copy", () => {
    expect(src).toContain("classifyGenerationError(");
    expect(src).toContain("error.message");
  });

  it("the not-found branch no longer renders a raw error string", () => {
    expect(src).not.toContain('error ?? "We couldn\'t find this Storybook."');
    expect(src).toMatch(/We couldn't find this Storybook/);
  });

  it("retryable reader failures render a Try-again affordance", () => {
    expect(src).toMatch(/error\.retryable/);
    expect(src).toMatch(/Try again/);
  });

  it("support-classified failures keep a typed navigation/support action visible", () => {
    const createSrc = readMobile("app/(tabs)/create/index.tsx");
    expect(createSrc).toMatch(/error\.kind\s*===\s*["']support["']/);
    expect(src).toMatch(/error\.kind\s*===\s*["']support["']/);
  });
});
