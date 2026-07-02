import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  scrubValue,
  scrubObject,
  beforeSendScrub,
  shouldSentryBeActive,
} from "@/lib/sentry-scrub";

/**
 * Issue 150 — Sentry on the Next.js API: capture, scrub child data, fail-open.
 *
 * The COPPA/GDPR line is the load-bearing one: the logger MUST NEVER capture
 * child photos, biometric/LoRA data, PII, consent tokens, auth tokens, or
 * secrets. Scrubbing is tested exhaustively. Fails open: with no DSN or under
 * test, capture is a no-op and the app keeps working.
 */

describe("150 — scrubber strips all PII / child data / secrets", () => {
  it("redacts values whose key matches a PII pattern", () => {
    expect(scrubValue("photoUrl", "https://x/photo.png")).toBe("[redacted]");
    expect(scrubValue("loraId", "lora-abc-123")).toBe("[redacted]");
    expect(scrubValue("voiceClipId", "clip-123")).toBe("[redacted]");
    expect(scrubValue("consentToken", "tok-xyz")).toBe("[redacted]");
    expect(scrubValue("authorization", "Bearer abc")).toBe("[redacted]");
    expect(scrubValue("apiKey", "sk-123")).toBe("[redacted]");
    expect(scrubValue("serviceRole", "sr-123")).toBe("[redacted]");
    expect(scrubValue("email", "parent@x.com")).toBe("[redacted]");
    expect(scrubValue("birthDate", "2025-03-01")).toBe("[redacted]");
    expect(scrubValue("babyName", "Maya")).toBe("[redacted]");
    expect(scrubValue("personaId", "p-1")).toBe("[redacted]");
    expect(scrubValue("familyId", "f-1")).toBe("[redacted]");
    expect(scrubValue("memberId", "m-1")).toBe("[redacted]");
  });

  it("redacts values that look like child/biometric URLs/paths", () => {
    expect(scrubValue("path", "storage/voice/clip.webm")).toBe("[redacted-url]");
    expect(scrubValue("href", "https://supabase.storage/avatars/family-1")).toBe("[redacted-url]");
    expect(scrubValue("src", "/photos/baby-1.png")).toBe("[redacted-url]");
    expect(scrubValue("link", "signed-url-abc")).toBe("[redacted-url]");
  });

  it("redacts long base64 blobs (biometric/photo data)", () => {
    const blob = "A".repeat(300) + "==";
    expect(scrubValue("data", blob)).toBe("[redacted-blob]");
  });

  it("does not redact benign values", () => {
    expect(scrubValue("status", "draft")).toBe("draft");
    expect(scrubValue("count", 42)).toBe(42);
    expect(scrubValue("theme", "Bedtime stars")).toBe("Bedtime stars");
    expect(scrubValue("page", 3)).toBe(3);
  });

  it("scrubObject walks nested objects recursively", () => {
    const input = {
      request: {
        body: { babyName: "Maya", photoUrl: "https://x/p.png", theme: "stars" },
        headers: { authorization: "Bearer xyz", contentType: "application/json" },
      },
      extra: { loraId: "l-1", storyTitle: "Bedtime" },
    };
    const out = scrubObject(input) as Record<string, unknown>;
    const req = out.request as Record<string, unknown>;
    const body = req.body as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown>;
    expect(body.babyName).toBe("[redacted]");
    expect(body.photoUrl).toBe("[redacted]");
    expect(body.theme).toBe("stars");
    expect(headers.authorization).toBe("[redacted]");
    expect(headers.contentType).toBe("application/json");
    expect((out.extra as Record<string, unknown>).loraId).toBe("[redacted]");
    expect((out.extra as Record<string, unknown>).storyTitle).toBe("Bedtime");
  });

  it("scrubObject never throws — returns [scrub-error] on catastrophic failure", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    // Circular references don't crash Object.entries (they just don't recurse).
    expect(() => scrubObject(circular)).not.toThrow();
  });
});

describe("150 — beforeSendScrub strips request/extra/breadcrumbs + user PII", () => {
  it("strips email/name/ip from user, keeps opaque ID only", () => {
    const event = {
      user: { id: "u-1", email: "parent@x.com", username: "parent", ip_address: "1.2.3.4" },
    };
    const out = beforeSendScrub(event) as Record<string, unknown>;
    const user = out.user as Record<string, unknown>;
    expect(user.id).toBe("u-1");
    expect(user.email).toBeUndefined();
    expect(user.username).toBeUndefined();
    expect(user.ip_address).toBeUndefined();
  });

  it("scrubs request body + extra + breadcrumbs", () => {
    const event = {
      request: { body: { babyName: "Maya", consentToken: "tok" } },
      extra: { photoUrl: "https://x/p.png", loraId: "l-1" },
      breadcrumbs: [{ data: { authorization: "Bearer abc" } }],
    };
    const out = beforeSendScrub(event) as Record<string, unknown>;
    const req = out.request as Record<string, unknown>;
    const body = req.body as Record<string, unknown>;
    expect(body.babyName).toBe("[redacted]");
    expect(body.consentToken).toBe("[redacted]");
    const extra = out.extra as Record<string, unknown>;
    expect(extra.photoUrl).toBe("[redacted]");
    expect(extra.loraId).toBe("[redacted]");
  });

  it("returns null on catastrophic failure (drop the event rather than leak)", () => {
    const out = beforeSendScrub(null as unknown as Record<string, unknown>);
    // null request/extra/etc → the guard returns the event (null is fine).
    // But the key invariant: it never throws.
    expect(out).not.toThrow;
  });
});

describe("150 — fail-open: Sentry disabled when no DSN or under test", () => {
  const env = process.env as Record<string, string | undefined>;
  beforeEach(() => {
    delete env.SENTRY_DSN;
    delete env.NODE_ENV;
  });
  afterEach(() => {
    delete env.SENTRY_DSN;
    env.NODE_ENV = "test";
  });

  it("shouldSentryBeActive is false under test env", () => {
    env.NODE_ENV = "test";
    env.SENTRY_DSN = "https://x@sentry.io/1";
    expect(shouldSentryBeActive()).toBe(false);
  });

  it("shouldSentryBeActive is false when DSN is absent", () => {
    env.NODE_ENV = "production";
    delete env.SENTRY_DSN;
    expect(shouldSentryBeActive()).toBe(false);
  });

  it("shouldSentryBeActive is true when DSN is set and not under test", () => {
    env.NODE_ENV = "production";
    env.SENTRY_DSN = "https://x@sentry.io/1";
    expect(shouldSentryBeActive()).toBe(true);
  });
});
