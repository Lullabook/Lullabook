import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestContext,
  generateAndWait,
  householdWithBaby,
  withActiveSubscription,
} from "@/test/fixtures";

/**
 * Issue 164 — Restore the Learning story type (un-cut) per ADR-0026.
 *
 * The `learning` type already exists end-to-end (labels, storyType plumbing,
 * `anthropic.generateStory`). This un-cuts it: the mobile flag
 * (`EXPO_PUBLIC_R1_STORY_TYPES_ENABLED`) and server side agree, the Learning
 * symbol is role-correct (🎓, not the placeholder 🌟), and a `learning` Brief
 * generates a viewable draft on the same placeholder-art path as issue 162.
 *
 * I3.2: mobile flag + server gate agree — a `learning` Brief is never rejected
 * by a lingering server cut.
 */

describe("164 — Restore the Learning story type (un-cut)", () => {
  describe("server side — no gate blocks a `learning` Brief", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("a `learning` Brief generates a viewable draft (no server-side cut rejects it)", async () => {
      const ctx = createTestContext();
      const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

      const book = await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "learning",
        theme: "Counting stars with Nani",
      });

      expect(book.status).toBe("draft");
      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.length).toBeGreaterThan(0);
      expect(pages.every((p) => p.text.length > 0)).toBe(true);
    });

    it("the FakeAnthropic receives the `learning` storyType (instruction set branches)", async () => {
      const ctx = createTestContext();
      const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

      await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "learning",
        theme: "sharing and kindness",
      });

      expect(ctx.anthropic.calls).toHaveLength(1);
      const call = ctx.anthropic.calls[0] as { storyType?: string };
      expect(call.storyType).toBe("learning");
    });
  });

  describe("mobile flag — Create screen shows both types when enabled", () => {
    beforeEach(() => {
      vi.stubEnv("EXPO_PUBLIC_R1_STORY_TYPES_ENABLED", "true");
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("isR1MultiStoryTypeEnabled returns true when the flag is set", async () => {
      const { isR1MultiStoryTypeEnabled } = await import("../mobile/lib/r1-flags");
      expect(isR1MultiStoryTypeEnabled()).toBe(true);
    });

    it("isR1MultiStoryTypeEnabled returns false when the flag is unset (cut stays reversible)", async () => {
      vi.stubEnv("EXPO_PUBLIC_R1_STORY_TYPES_ENABLED", "");
      const { isR1MultiStoryTypeEnabled } = await import("../mobile/lib/r1-flags");
      expect(isR1MultiStoryTypeEnabled()).toBe(false);
    });

    it("the Create screen STORY_TYPES constant includes both bedtime and learning when enabled", async () => {
      // The constant is computed at module load time from the flag. We verify
      // the source includes both types in ALL_STORY_TYPES and the Learning
      // symbol is role-correct (🎓, not the placeholder 🌀).
      const fs = await import("fs");
      const path = await import("path");
      const src = fs.readFileSync(
        path.resolve(process.cwd(), "mobile/app/(tabs)/create/index.tsx"),
        "utf8"
      );
      // ALL_STORY_TYPES includes learning with a role-correct symbol.
      expect(src).toMatch(/key:\s*["']learning["'].*icon:\s*["']🎓["']/s);
      expect(src).not.toMatch(/key:\s*["']learning["'].*icon:\s*["']🌟["']/s);
      // Bedtime still uses 🌙.
      expect(src).toMatch(/key:\s*["']bedtime["'].*icon:\s*["']🌙["']/s);
    });
  });
});
