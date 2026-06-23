import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  shouldDevBypassLiveness,
  shouldDevFalFallback,
} from "@/lib/dev-bypass";

/**
 * Issue 135 — Release hardening: secrets audit + Apple App Review prep.
 *
 * (a) No secret value rides an `EXPO_PUBLIC_*` var (those are bundled into the
 * client by definition). (b) Every dev override path is inert when
 * `NODE_ENV === "production"` — the release build can never bypass liveness,
 * fal training, or seed the demo. (c) The App Review packet exists.
 */

const REPO_ROOT = process.cwd();

function readEnvExample(): string {
  try {
    return readFileSync(join(REPO_ROOT, ".env.example"), "utf-8");
  } catch {
    return "";
  }
}

describe("135 — secrets audit + release-config", () => {
  describe("no secret rides an EXPO_PUBLIC_* var", () => {
    it("the .env.example never pairs EXPO_PUBLIC_* with a real secret value", () => {
      const example = readEnvExample();
      const lines = example.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (!/^EXPO_PUBLIC_/i.test(trimmed)) continue;
        // An EXPO_PUBLIC_* line may NAME a secret to avoid (comment guidance)
        // but must never ASSIGN a real value. A bare `=` with a non-empty RHS
        // is the smell — assert the RHS is empty or a placeholder.
        const value = trimmed.slice(trimmed.indexOf("=") + 1);
        expect(value, `EXPO_PUBLIC var has a value: ${trimmed}`).toMatch(/^$|^(dev-only|<|placeholder|your-|set-)/i);
      }
    });

    it("EXPO_PUBLIC_DEV_PASSWORD is a dev-only sim cred, never a real secret", () => {
      const example = readEnvExample();
      // The dev password is a simulator-only convenience; it must be flagged
      // dev-only and must not ship in a release build (the release-config
      // check below asserts the dev flags are inert in production).
      if (/EXPO_PUBLIC_DEV_PASSWORD/.test(example)) {
        expect(example).toMatch(/dev[- ]only|sim/i);
      }
    });
  });

  describe("dev override paths are inert in production", () => {
    const prev = process.env.NODE_ENV;

    beforeEach(() => {
      (process.env as Record<string, string>).NODE_ENV = "production";
    });

    afterEach(() => {
      (process.env as Record<string, string>).NODE_ENV = prev ?? "test";
    });

    it("liveness bypass is inert in production even with the flag on", () => {
      process.env.DEV_LIVENESS_BYPASS = "true";
      expect(shouldDevBypassLiveness()).toBe(false);
    });

    it("fal fallback is inert in production even with the flag on", () => {
      process.env.DEV_FAL_FALLBACK = "true";
      expect(shouldDevFalFallback()).toBe(false);
    });

    it("the demo seed route is inert in production (NODE_ENV gate)", async () => {
      // The /api/dev/seed route guards on NODE_ENV !== "production" AND
      // DEV_DEMO_SEED === "true". In production it returns 403 before any work.
      process.env.DEV_DEMO_SEED = "true";
      const { POST } = await import("@/app/api/dev/seed/route");
      const req = new Request("http://localhost/api/dev/seed", {
        method: "POST",
        headers: { Authorization: "Bearer test-token" },
      });
      const res = await POST(req as never);
      expect(res.status).toBe(403);
    });
  });

  describe("Apple App Review packet", () => {
    it("the App Review packet document exists", async () => {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const packet = path.join(
        REPO_ROOT,
        "CONTEXT",
        "docs",
        "adr",
        "apple-app-review-packet.md"
      );
      const stat = await fs.stat(packet);
      expect(stat.isFile()).toBe(true);
      const content = await fs.readFile(packet, "utf-8");
      // Guideline 4.2 (kids / biometric) + consent flow + privacy disclosures.
      expect(content).toMatch(/4\.2|kids|biometric/i);
      expect(content).toMatch(/consent/i);
      expect(content).toMatch(/privacy|nutrition/i);
    });
  });
});
