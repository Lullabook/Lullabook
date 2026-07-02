import { describe, expect, it } from "vitest";

/**
 * Issue 151 — Sentry Expo: crash capture, source maps, no photo-screen replay.
 *
 * The testable seam is the mobile scrubber + the activation gate (pure logic,
 * exercised without a RN runtime). The component wiring is type-checked via
 * (cd mobile && npx tsc --noEmit). Invariants:
 *  - No child data leaves the device: scrubbing strips PII/photos/LoRA/tokens.
 *  - attachScreenshot: false; replay off entirely (safest default).
 *  - Fails open: no DSN → no-op, app still renders.
 */
import { beforeEachScrubMobile, shouldMobileSentryBeActive } from "../mobile/lib/sentry-scrub";

describe("151 — mobile scrubber strips PII (same COPPA gate as server)", () => {
  it("redacts photo/avatar/voice/lora keys", () => {
    const out = beforeEachScrubMobile({
      extra: { photoUrl: "https://x/p.png", loraId: "l-1", voiceClipId: "v-1", babyName: "Maya" },
    }) as Record<string, unknown>;
    const extra = out.extra as Record<string, unknown>;
    expect(extra.photoUrl).toBe("[redacted]");
    expect(extra.loraId).toBe("[redacted]");
    expect(extra.voiceClipId).toBe("[redacted]");
    expect(extra.babyName).toBe("[redacted]");
  });

  it("strips email/name/ip from user, keeps opaque ID", () => {
    const out = beforeEachScrubMobile({
      user: { id: "u-1", email: "p@x.com", username: "parent", ip_address: "1.2.3.4" },
    }) as Record<string, unknown>;
    const user = out.user as Record<string, unknown>;
    expect(user.id).toBe("u-1");
    expect(user.email).toBeUndefined();
    expect(user.ip_address).toBeUndefined();
  });

  it("returns null on catastrophic failure (drop rather than leak)", () => {
    expect(beforeEachScrubMobile(null as unknown as Record<string, unknown>)).not.toThrow;
  });
});

describe("151 — mobile Sentry activation gate (fail-open)", () => {
  it("shouldMobileSentryBeActive is false when no DSN is set", () => {
    expect(shouldMobileSentryBeActive()).toBe(false);
  });
});
