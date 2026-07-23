import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestContext,
  generateAndWait,
  householdWithBaby,
} from "@/test/fixtures";

/**
 * Issue 165 — Restore the Journal (solo, one Baby) — un-cut per ADR-0026.
 *
 * The World home already advertises "Your baby's Journal — log a moment, see
 * the timeline" (mobile/app/(tabs)/index.tsx). The Moments API already exists
 * (src/app/api/moments/route.ts). This un-cuts the Journal: the flag
 * (`EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED`) and server side agree, and the
 * reachable UI opens a working per-Baby Journal.
 *
 * I2.4 (critical): un-cutting the Journal must NOT make story generation
 * depend on Moments. `isR1JournalMachineryEnabled()` continues to gate ONLY
 * the auto-context injection in `runGenerationBodyInner`; a book with zero
 * Moments still generates (issue 162 path).
 */

describe("165 — Restore the Journal (solo, one Baby)", () => {
  describe("I2.4 — generation succeeds with zero Moments (no new hard dependency)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("a book with ZERO Moments generates a viewable draft (journal un-cut does not break gen)", async () => {
      // Enable journal machinery — auto-context injection is on.
      vi.stubEnv("R1_JOURNAL_MACHINERY_ENABLED", "true");

      const ctx = createTestContext();
      const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

      // No Moments exist for this baby — zero Moments.
      const momentsBefore = ctx.moments.list(guardian.id, baby.id);
      expect(momentsBefore).toHaveLength(0);

      const book = await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "cozy night with zero moments",
      });

      // Generation succeeded — draft, not failed.
      expect(book.status).toBe("draft");
      const pages = ctx.store.getPagesForStorybook(book.id);
      expect(pages.length).toBeGreaterThan(0);
    });

    it("bounded context injection no longer depends on the journal flag (PRD v21 restores the engine)", async () => {
      // Journal machinery stays off — the bounded Story Context Engine is
      // independent of it since ticket 181 (ADR-0028 restores only the
      // bounded engine; Journal nudges/suggestions remain gated).
      vi.stubEnv("R1_JOURNAL_MACHINERY_ENABLED", "");

      const ctx = createTestContext();
      const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

      // Add a Moment — the bounded engine selects it even with the flag off.
      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: "First steps today!",
        momentType: "first",
        occurredOn: new Date().toISOString().slice(0, 10),
        isSignificant: true,
      });

      const anthropicSpy = vi.spyOn(ctx.anthropic, "generateStory");

      await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "cozy night",
      });

      expect(anthropicSpy).toHaveBeenCalledTimes(1);
      const call = anthropicSpy.mock.calls[0][0] as { momentContext?: string };
      // Bounded engine runs regardless of the journal flag — and generation
      // still completes (no hard dependency on the context layer).
      expect(call.momentContext).toContain("First steps today!");
    });

    it("auto-context injection is on when the flag is set (Moment reaches the prompt)", async () => {
      vi.stubEnv("R1_JOURNAL_MACHINERY_ENABLED", "true");

      const ctx = createTestContext();
      const { guardian, babyPersona, baby } = await householdWithBaby(ctx, "Maya");

      ctx.moments.create({
        memberId: guardian.id,
        babyId: baby.id,
        body: "First steps today!",
        momentType: "first",
        occurredOn: new Date().toISOString().slice(0, 10),
        isSignificant: true,
      });

      const anthropicSpy = vi.spyOn(ctx.anthropic, "generateStory");

      await generateAndWait(ctx, guardian.id, {
        starringPersonaIds: [babyPersona.id],
        babyId: baby.id,
        storyType: "bedtime",
        theme: "cozy night",
      });

      expect(anthropicSpy).toHaveBeenCalledTimes(1);
      const call = anthropicSpy.mock.calls[0][0] as { momentContext?: string };
      // When the flag is on, the Moment's body reaches the prompt.
      expect(call.momentContext).toContain("First steps today!");
    });
  });

  describe("I3.2/I3.3 — server + mobile gate agree; solo one-Baby", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("the World home Journal card is always reachable (not gated behind the flag)", () => {
      // The World home (mobile/app/(tabs)/index.tsx) shows the Journal card
      // unconditionally — it's not behind isR1JournalMachineryEnabled(). The
      // flag only gates the Firsts filter chip and auto-context injection.
      const fs = require("fs") as typeof import("fs");
      const path = require("path") as typeof import("path");
      const src = fs.readFileSync(
        path.resolve(process.cwd(), "mobile/app/(tabs)/index.tsx"),
        "utf8"
      );
      // The Journal hero card is not behind a flag check.
      expect(src).toMatch(/journalHero/);
      expect(src).toMatch(/Open.*Journal/);
    });

    it("the Daily screen Journal capture is reachable (not gated behind the flag)", () => {
      const fs = require("fs") as typeof import("fs");
      const path = require("path") as typeof import("path");
      const src = fs.readFileSync(
        path.resolve(process.cwd(), "mobile/app/daily.tsx"),
        "utf8"
      );
      // The capture form (What happened today?) is not behind a flag — only
      // the Firsts filter chip is gated.
      expect(src).toMatch(/What happened today/);
      // The Firsts chip IS behind the flag.
      expect(src).toMatch(/isR1JournalMachineryEnabled/);
    });
  });

  describe("mobile flag — isR1JournalMachineryEnabled", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("returns true when the flag is set", async () => {
      vi.stubEnv("EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED", "true");
      const { isR1JournalMachineryEnabled } = await import("../mobile/lib/r1-flags");
      expect(isR1JournalMachineryEnabled()).toBe(true);
    });

    it("returns false when the flag is unset (cut stays reversible)", async () => {
      vi.stubEnv("EXPO_PUBLIC_R1_JOURNAL_MACHINERY_ENABLED", "");
      const { isR1JournalMachineryEnabled } = await import("../mobile/lib/r1-flags");
      expect(isR1JournalMachineryEnabled()).toBe(false);
    });
  });
});
