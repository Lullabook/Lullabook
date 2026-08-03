import { describe, expect, it } from "vitest";
import { getProductionStoryModel } from "@/adapters/anthropic";
import { FakeAnthropic } from "@/adapters/fakes";
import {
  FAL_FLUX_1_LORA_ENDPOINT,
  FAL_FLUX_1_LORA_MODEL,
  FAL_FLUX_1_TRAIN_ENDPOINT,
  FAL_NANO_BANANA_2_EDIT_ENDPOINT,
} from "@/adapters/fal";
import { DataStore } from "@/db/store";
import { R1_MARGIN_THRESHOLDS, R1_PLAN_DEFINITION } from "@/domain/plan";
import {
  estimateProviderCostUsd,
  TEXT_WORST_CASE_UNITS,
} from "@/lib/provider-prices";
import {
  computeMarginPercent,
  CostThreshold,
  ProviderCostMeteringService,
  SpendBlockedError,
} from "@/services/provider-cost-metering";
import { StoryCapError, StoryCapService } from "@/services/story-cap";
import { TextStoryService } from "@/services/text-story";
import {
  createReadyAdult,
  createTestContext,
  subscribedGuardian,
  withActiveSubscription,
} from "@/test/fixtures";

/**
 * Issue 190 — atomic allowance and payable spend authorization.
 *
 * Proves the Family-shared Story allowance (cap-minus-one → exactly one
 * reservation wins; the loser gets typed `story_cap_reached`; text failure
 * and watchdog reaping release exactly once; page repair never reserves a
 * second book), the versioned price table (non-zero estimates for every
 * payable attempt type, unknown routes fail closed), the margin formula and
 * green/amber/red bands, the fail-closed authorization gate, and the
 * text-story seam (authorizeSpend before the Anthropic boundary, non-zero
 * versioned estimates, reconciled secret-free ledger rows).
 */
describe("190 — atomic allowance and payable spend authorization", () => {
  describe("atomic Family-shared Story allowance", () => {
    it("at cap-minus-one exactly one of two reservation attempts wins; the loser gets typed story_cap_reached", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-cap", "cap@example.com");
      withActiveSubscription(ctx, guardian);
      const cap = new StoryCapService(ctx.store, ctx.entitlements);

      // Two starring Personas must NOT multiply the allowance: the cap stays
      // the plan's shared per-Family Storybook count.
      expect(cap.getUsage(guardian.familyId, guardian.id).cap).toBe(
        R1_PLAN_DEFINITION.limits.storybooksPerMonth
      );

      // Fill to cap-minus-one (3 of 4 for Just Us) with distinct reserved books.
      for (let i = 0; i < 3; i++) {
        cap.reserve(guardian.familyId, guardian.id, `book-190-${i}`);
      }
      expect(cap.getUsage(guardian.familyId, guardian.id).remaining).toBe(1);

      // Two concurrent requests at cap-minus-one (sequential proxy): exactly
      // one reservation wins, the other is a typed story_cap_reached.
      cap.reserve(guardian.familyId, guardian.id, "book-190-winner");
      expect(() => cap.reserve(guardian.familyId, guardian.id, "book-190-loser")).toThrow(
        StoryCapError
      );
      try {
        cap.reserve(guardian.familyId, guardian.id, "book-190-loser");
        throw new Error("expected story_cap_reached");
      } catch (err) {
        expect(err).toBeInstanceOf(StoryCapError);
        const typed = err as StoryCapError;
        expect(typed.code).toBe("story_cap_reached");
        expect(typed.count).toBe(R1_PLAN_DEFINITION.limits.storybooksPerMonth);
        expect(typed.cap).toBe(R1_PLAN_DEFINITION.limits.storybooksPerMonth);
      }
      // The count stays at the cap — the loser took no slot.
      expect(cap.getUsage(guardian.familyId, guardian.id).count).toBe(
        R1_PLAN_DEFINITION.limits.storybooksPerMonth
      );
    });

    it("does not multiply the allowance per Persona or per Member", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      await createReadyAdult(ctx, guardian, "Persona A");
      await createReadyAdult(ctx, guardian, "Persona B");
      const cap = new StoryCapService(ctx.store, ctx.entitlements);

      // Two Personas in the Family still yields a 4-Storybook shared cap.
      expect(cap.getUsage(guardian.familyId, guardian.id).cap).toBe(4);
      const secondMember = ctx.store.createMember({
        authUserId: "auth-190-cap-2",
        familyId: guardian.familyId,
        email: "member2@example.com",
        role: "member",
        selfPersonaId: null,
        jurisdiction: "US",
      });
      // Reservations from a second Member consume the SAME shared pool.
      cap.reserve(guardian.familyId, guardian.id, "book-190-m1-0");
      cap.reserve(guardian.familyId, guardian.id, "book-190-m1-1");
      cap.reserve(guardian.familyId, secondMember.id, "book-190-m2-0");
      cap.reserve(guardian.familyId, guardian.id, "book-190-m1-3");
      expect(() =>
        cap.reserve(guardian.familyId, secondMember.id, "book-190-m2-4")
      ).toThrow(StoryCapError);
    });

    it("text failure releases a reservation exactly once", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-rel", "rel@example.com");
      withActiveSubscription(ctx, guardian);
      const cap = new StoryCapService(ctx.store, ctx.entitlements);

      cap.reserve(guardian.familyId, guardian.id, "book-190-rel");
      cap.release("book-190-rel");
      const audit = cap.getReservationAudit("book-190-rel")!;
      expect(audit.status).toBe("released");
      expect(audit.releaseReason).toBe("story_text_generation_failed");
      const releasedAtMs = audit.releasedAt!.getTime();

      // A second release is a no-op: exactly one release transition and the
      // allowance slot is fully back.
      cap.release("book-190-rel");
      expect(cap.getReservationAudit("book-190-rel")!.releasedAt!.getTime()).toBe(releasedAtMs);
      expect(cap.getReservation("book-190-rel")).toBeUndefined();
      expect(cap.getUsage(guardian.familyId, guardian.id).remaining).toBe(
        R1_PLAN_DEFINITION.limits.storybooksPerMonth
      );
    });

    it("watchdog reaping releases a stranded reservation exactly once; valid text is never refunded", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const persona = await createReadyAdult(ctx, guardian);

      // Text succeeded and the book is a readable draft. Simulate the watchdog
      // window where the text pass landed but the run hung before Pages: the
      // book is still `generating` with persisted valid text. Reaping must
      // return it to `draft` and must NOT release (text-backed drafts keep
      // their allowance).
      const goodBook = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: "watchdog keeps draft",
      });
      await ctx.workflow.drain();
      const goodRow = ctx.store.storybooks.get(goodBook.id)!;
      goodRow.createdAt = new Date(Date.now() - 6 * 60_000);
      goodRow.status = "generating";
      ctx.store.saveStorybook(goodRow);
      expect(ctx.storybooks.reapStrandedGenerations(new Date(), 5 * 60_000)).toBe(1);
      expect(ctx.store.storybooks.get(goodBook.id)!.status).toBe("draft");
      expect(ctx.storyCap.getReservationAudit(goodBook.id)!.status).toBe("committed");

      // Text failed / never produced: reaping releases the reservation exactly
      // once (idempotent — a second reap cannot release it again).
      const strandedBook = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [persona.id],
        storyType: "learning",
        theme: "watchdog strand",
      });
      const strandedRow = ctx.store.storybooks.get(strandedBook.id)!;
      strandedRow.createdAt = new Date(Date.now() - 6 * 60_000);
      ctx.store.saveStorybook(strandedRow);
      expect(ctx.storybooks.reapStrandedGenerations(new Date(), 5 * 60_000)).toBe(1);
      expect(ctx.store.storybooks.get(strandedBook.id)!.status).toBe("failed");
      const audit = ctx.storyCap.getReservationAudit(strandedBook.id)!;
      expect(audit.status).toBe("released");
      const releasedAtMs = audit.releasedAt!.getTime();
      expect(ctx.storybooks.reapStrandedGenerations(new Date(), 5 * 60_000)).toBe(0);
      expect(ctx.storyCap.getReservationAudit(strandedBook.id)!.releasedAt!.getTime()).toBe(
        releasedAtMs
      );
    });

    it("page repair never reserves a second Storybook", async () => {
      const ctx = createTestContext();
      const guardian = await subscribedGuardian(ctx);
      const persona = await createReadyAdult(ctx, guardian);
      ctx.fal.failImageOnPage = 3;
      ctx.fal.currentPage = 0;

      const book = await ctx.storybooks.generate(guardian.id, {
        starringPersonaIds: [persona.id],
        storyType: "bedtime",
        theme: "repair keeps one reservation",
      });
      await ctx.workflow.drain();

      const familyReservations = () =>
        [...ctx.store.storyAllowanceReservations.values()].filter(
          (r) => r.familyId === guardian.familyId
        );
      expect(familyReservations()).toHaveLength(1);

      const failedPage = ctx.store.getPagesForStorybook(book.id).find(
        (p) => p.generationStatus === "failed"
      )!;
      expect(failedPage).toBeTruthy();
      ctx.fal.failImageOnPage = null;
      ctx.storybooks.recoverPage(guardian.id, failedPage.id);
      await ctx.workflow.drain();

      // Repair is free recovery on the SAME book: still exactly one
      // reservation, still committed (valid text never refunded).
      const after = familyReservations();
      expect(after).toHaveLength(1);
      expect(after[0]!.status).toBe("committed");
      expect(after[0]!.storybookId).toBe(book.id);
    });
  });

  describe("versioned price table", () => {
    it("prices every payable attempt type with a non-zero estimate from a versioned table", () => {
      const cases: {
        label: string;
        route: { provider: string; endpoint: string; model: string };
        units: Record<string, number>;
      }[] = [
        {
          label: "text",
          route: { provider: "anthropic", endpoint: "messages.create", model: getProductionStoryModel() },
          units: TEXT_WORST_CASE_UNITS,
        },
        {
          label: "image",
          route: { provider: "fal.ai", endpoint: FAL_FLUX_1_LORA_ENDPOINT, model: FAL_FLUX_1_LORA_MODEL },
          units: { images: 1 },
        },
        {
          label: "training",
          route: { provider: "fal.ai", endpoint: FAL_FLUX_1_TRAIN_ENDPOINT, model: FAL_FLUX_1_LORA_MODEL },
          units: { trainings: 1 },
        },
        {
          label: "moderation",
          route: { provider: "sightengine", endpoint: "https://api.sightengine.com/1.0/check.json", model: "image-and-text" },
          units: { checks: 1 },
        },
        {
          label: "queue",
          route: { provider: "inngest", endpoint: "events.send", model: "durable-workflow" },
          units: { events: 1 },
        },
        {
          label: "storage",
          route: { provider: "cloudflare", endpoint: "r2.put", model: "object-storage" },
          units: { objects: 1 },
        },
        {
          label: "retry",
          route: { provider: "anthropic", endpoint: "messages.create", model: getProductionStoryModel() },
          units: TEXT_WORST_CASE_UNITS,
        },
        {
          label: "repair",
          route: { provider: "fal.ai", endpoint: FAL_NANO_BANANA_2_EDIT_ENDPOINT, model: "Nano Banana 2 Edit" },
          units: { images: 1 },
        },
      ];
      for (const c of cases) {
        const estimate = estimateProviderCostUsd({ ...c.route, units: c.units });
        expect(estimate.estimatedCostUsd, c.label).toBeGreaterThan(0);
        expect(estimate.pricingVersion, c.label).toBeTruthy();
      }
    });

    it("an unknown route fails closed instead of pricing provider work as free", () => {
      expect(() =>
        estimateProviderCostUsd({
          provider: "unknown-provider",
          endpoint: "unknown-endpoint",
          model: "unknown-model",
          units: { images: 1 },
        })
      ).toThrow();
      // A zero-unit payable attempt is not free either.
      expect(() =>
        estimateProviderCostUsd({
          provider: "fal.ai",
          endpoint: FAL_FLUX_1_LORA_ENDPOINT,
          model: FAL_FLUX_1_LORA_MODEL,
          units: { images: 0 },
        })
      ).toThrow();
    });
  });

  describe("margin and authorization gate", () => {
    it("computes margin as (net subscription revenue - attributable COGS) / net subscription revenue * 100", () => {
      expect(computeMarginPercent(100, 25)).toBeCloseTo(75, 5);
      expect(computeMarginPercent(100, 0)).toBe(100);
      expect(() => computeMarginPercent(0, 1)).toThrow();
      expect(() => computeMarginPercent(100, -1)).toThrow();
    });

    it("grades green <=5% variance, amber <=10%, red >10% and red margin below 70%", () => {
      const meter = new ProviderCostMeteringService(new DataStore());
      expect(meter.evaluateThreshold({ budgetUsd: 100, actualCostUsd: 102 })).toBe(
        CostThreshold.GREEN
      );
      expect(meter.evaluateThreshold({ budgetUsd: 100, actualCostUsd: 108 })).toBe(
        CostThreshold.AMBER
      );
      expect(meter.evaluateThreshold({ budgetUsd: 100, actualCostUsd: 112 })).toBe(
        CostThreshold.RED
      );
      // The existing contract is symmetric: a 5% under-spend is also green.
      expect(meter.evaluateThreshold({ budgetUsd: 100, actualCostUsd: 95 })).toBe(
        CostThreshold.GREEN
      );
      // Bands derive from the canonical plan constants.
      expect(R1_MARGIN_THRESHOLDS.greenVarianceMaxPercent).toBe(5);
      expect(R1_MARGIN_THRESHOLDS.amberVarianceMaxPercent).toBe(10);
      expect(R1_MARGIN_THRESHOLDS.fullCapP95MarginFloorPercent).toBe(70);
    });

    it("missing margin evidence fails closed; a red margin blocks payable work", () => {
      const meter = new ProviderCostMeteringService(new DataStore());
      const base = {
        familyId: "family-190",
        provider: "anthropic",
        endpoint: "messages.create",
        model: getProductionStoryModel(),
      };

      expect(() => meter.authorizeSpend({ ...base, budgetUsd: 100, actualCostUsd: 50 })).toThrow(
        SpendBlockedError
      );
      expect(() =>
        meter.authorizeSpend({
          ...base,
          marginEvidence: { netSubscriptionRevenueUsd: 100, attributableCogsUsd: 40 },
          budgetUsd: 100,
          actualCostUsd: 50,
        })
      ).toThrow(SpendBlockedError);
      expect(() =>
        meter.authorizeSpend({
          ...base,
          marginEvidence: { netSubscriptionRevenueUsd: 100, attributableCogsUsd: 20 },
          budgetUsd: 100,
          actualCostUsd: 112,
        })
      ).toThrow(SpendBlockedError);
    });

    it("a healthy margin authorizes spend (no silent overage on the green path)", () => {
      const meter = new ProviderCostMeteringService(new DataStore());
      const base = {
        familyId: "family-190",
        provider: "anthropic",
        endpoint: "messages.create",
        model: getProductionStoryModel(),
      };
      expect(
        meter.authorizeSpend({
          ...base,
          marginEvidence: { netSubscriptionRevenueUsd: 100, attributableCogsUsd: 20 },
          budgetUsd: 100,
          actualCostUsd: 95,
        })
      ).toBe(CostThreshold.GREEN);
      expect(
        meter.authorizeSpend({
          ...base,
          p95FullCapMarginPercent: 70,
          budgetUsd: 100,
          actualCostUsd: 95,
        })
      ).toBe(CostThreshold.GREEN);
    });
  });

  describe("text-story spend seam", () => {
    async function textStoryFixture(marginEvidence?: {
      netSubscriptionRevenueUsd: number;
      attributableCogsUsd: number;
    }) {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-txt", "txt@example.com");
      const character = await ctx.characters.create({
        memberId: guardian.id,
        questionnaire: {
          name: "Coco",
          topics: ["curious"],
          favoriteAnimals: ["cats"],
          isFictional: true,
        },
        attestation: "I am a parent/guardian creating this for my own family",
      });
      const meter = new ProviderCostMeteringService(ctx.store);
      const service = new TextStoryService(ctx.store, ctx.anthropic, ctx.childSafety, meter, marginEvidence);
      return { ctx, guardian, character, meter, service };
    }

    it("calls authorizeSpend before the Anthropic boundary and blocks on a red switch with zero provider calls", async () => {
      const { ctx, guardian, character, meter, service } = await textStoryFixture({
        netSubscriptionRevenueUsd: 100,
        attributableCogsUsd: 20,
      });
      meter.setKillSwitch({
        scope: "all",
        threshold: CostThreshold.RED,
        reason: "deterministic red global for 190",
      });

      await expect(
        service.generate(guardian.id, {
          starringCharacterIds: [character.id],
          storyType: "bedtime",
          theme: "blocked story",
        })
      ).rejects.toThrow(SpendBlockedError);
      // The provider boundary was never reached, and no attempt was recorded
      // (a blocked attempt is not a payable attempt).
      expect(ctx.anthropic.textStoryCalls).toHaveLength(0);
      expect([...ctx.store.providerCostLedgerEntries.values()]).toHaveLength(0);
    });

    it("blocks on a red switch even without injected margin evidence (default kill-switch gate)", async () => {
      const { ctx, guardian, character, meter, service } = await textStoryFixture();
      meter.setKillSwitch({
        scope: "all",
        threshold: CostThreshold.RED,
        reason: "deterministic red global for 190 default gate",
      });

      await expect(
        service.generate(guardian.id, {
          starringCharacterIds: [character.id],
          storyType: "bedtime",
          theme: "blocked free story",
        })
      ).rejects.toThrow(SpendBlockedError);
      expect(ctx.anthropic.textStoryCalls).toHaveLength(0);
    });

    it("records a non-zero versioned estimate for a reconciled text attempt without prompt leakage", async () => {
      const { ctx, guardian, character, service } = await textStoryFixture({
        netSubscriptionRevenueUsd: 100,
        attributableCogsUsd: 20,
      });

      const story = await service.generate(guardian.id, {
        starringCharacterIds: [character.id],
        storyType: "bedtime",
        theme: "cozy forest secret",
      });
      expect(story.text.length).toBeGreaterThan(0);

      const entries = [...ctx.store.providerCostLedgerEntries.values()].filter(
        (e) => e.owningEntityIds.familyId === guardian.familyId
      );
      expect(entries).toHaveLength(1);
      const entry = entries[0]!;
      expect(entry.attemptType).toBe("text");
      expect(entry.outcome).toBe("succeeded");
      expect(entry.estimatedCostUsd).toBeGreaterThan(0);
      expect(entry.pricingVersion).toBe("r1-text-v1");
      expect(entry.requestId).toBeTruthy();
      expect(entry.latencyMs).toBeGreaterThanOrEqual(0);
      expect(entry.owningEntityIds).toEqual({ familyId: guardian.familyId });
      // No prompt/photo/credential leakage into the ledger row.
      const json = JSON.stringify(entry);
      expect(json).not.toMatch(/cozy forest secret|SECRET|api[_-]?key/i);
    });

    it("records a failed terminal outcome when the provider throws", async () => {
      const { ctx, guardian, character, meter } = await textStoryFixture({
        netSubscriptionRevenueUsd: 100,
        attributableCogsUsd: 20,
      });
      class FailingTextStoryAnthropic extends FakeAnthropic {
        override async generateTextStory(): Promise<{ text: string }> {
          throw new Error("anthropic text unavailable");
        }
      }
      const service = new TextStoryService(
        ctx.store,
        new FailingTextStoryAnthropic(),
        ctx.childSafety,
        meter,
        { netSubscriptionRevenueUsd: 100, attributableCogsUsd: 20 }
      );

      await expect(
        service.generate(guardian.id, {
          starringCharacterIds: [character.id],
          storyType: "learning",
          theme: "fails",
        })
      ).rejects.toThrow(/unavailable/);
      const entries = [...ctx.store.providerCostLedgerEntries.values()].filter(
        (e) => e.owningEntityIds.familyId === guardian.familyId
      );
      expect(entries).toHaveLength(1);
      expect(entries[0]!.outcome).toBe("failed");
      expect(entries[0]!.estimatedCostUsd).toBeGreaterThan(0);
    });
  });

  describe("workflow composition guard", () => {
    it("authorizes a payable run before the provider boundary with derived margin evidence", async () => {
      const { authorizePayableRun } = await import("@/workflows/functions");
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-wf", "wf@example.com");
      withActiveSubscription(ctx, guardian);
      const meter = new ProviderCostMeteringService(ctx.store);

      // Healthy family: the run is authorized and priced from the versioned table.
      const auth = authorizePayableRun(meter, {
        familyId: guardian.familyId,
        route: {
          provider: "anthropic",
          endpoint: "messages.create",
          model: getProductionStoryModel(),
        },
        units: { ...TEXT_WORST_CASE_UNITS },
      });
      expect(auth.threshold).toBe(CostThreshold.GREEN);
      expect(auth.estimatedCostUsd).toBeGreaterThan(0);
      expect(auth.pricingVersion).toBeTruthy();

      // A persisted red global switch blocks the same run before any provider work.
      meter.setKillSwitch({
        scope: "all",
        threshold: CostThreshold.RED,
        reason: "red global blocks the workflow run",
      });
      expect(() =>
        authorizePayableRun(meter, {
          familyId: guardian.familyId,
          route: {
            provider: "anthropic",
            endpoint: "messages.create",
            model: getProductionStoryModel(),
          },
          units: { ...TEXT_WORST_CASE_UNITS },
        })
      ).toThrow(SpendBlockedError);
    });

    it("fails closed at the composition when the Family has no subscription revenue evidence", async () => {
      const { authorizePayableRun } = await import("@/workflows/functions");
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-wf-free", "wffree@example.com");
      const meter = new ProviderCostMeteringService(ctx.store);

      expect(() =>
        authorizePayableRun(meter, {
          familyId: guardian.familyId,
          route: {
            provider: "anthropic",
            endpoint: "messages.create",
            model: getProductionStoryModel(),
          },
          units: { ...TEXT_WORST_CASE_UNITS },
        })
      ).toThrow(SpendBlockedError);
    });
  });

  describe("reconciled ledger rows", () => {
    it("records actual cost, ownership IDs, request ID, latency, and terminal outcome without sensitive leakage", () => {
      const store = new DataStore();
      const meter = new ProviderCostMeteringService(store);
      const entry = meter.recordAttempt({
        provider: "anthropic",
        endpoint: "messages.create",
        model: getProductionStoryModel(),
        pricingVersion: "r1-text-v1",
        units: { input_tokens: 100, output_tokens: 200 },
        estimatedCostUsd: 0.003,
        actualCostUsd: 0.0028,
        latencyMs: 3210,
        requestId: "req-190",
        owningEntityIds: {
          familyId: "family-190",
          storybookId: "book-190",
          personaId: "persona-190",
          pageId: "page-190",
        },
        attemptType: "text",
        outcome: "succeeded",
        prompt: "SECRET_PROMPT",
        photoBytes: "SECRET_PHOTO",
        apiKey: "SECRET_KEY",
      } as never);

      expect(entry).toMatchObject({
        actualCostUsd: 0.0028,
        latencyMs: 3210,
        requestId: "req-190",
        providerRequestId: "req-190",
        outcome: "succeeded",
        owningEntityIds: {
          familyId: "family-190",
          storybookId: "book-190",
          personaId: "persona-190",
          pageId: "page-190",
        },
      });
      const json = JSON.stringify(entry);
      expect(json).not.toMatch(/SECRET_/);
      expect(entry.actualCostUsd).toBe(0.0028);
    });
  });

  describe("worst-case estimate and margin derivation", () => {
    it("derives Family margin evidence from subscription revenue and ledger COGS", () => {
      const ctx = createTestContext();
      const guardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-mg", "mg@example.com");
      withActiveSubscription(ctx, guardian);
      const meter = new ProviderCostMeteringService(ctx.store);

      // No ledger spend yet: revenue-backed margin is ~100% (green).
      const clean = meter.deriveMarginEvidence(guardian.familyId)!;
      expect(clean.netSubscriptionRevenueUsd).toBeGreaterThan(0);
      expect(clean.attributableCogsUsd).toBe(0);
      expect(computeMarginPercent(clean.netSubscriptionRevenueUsd, clean.attributableCogsUsd)).toBe(100);

      // Recorded COGS lowers the derived margin deterministically.
      meter.recordAttempt({
        provider: "fal.ai",
        endpoint: FAL_FLUX_1_LORA_ENDPOINT,
        model: FAL_FLUX_1_LORA_MODEL,
        pricingVersion: "r1-image-v1",
        units: { images: 1 },
        estimatedCostUsd: 0.06,
        actualCostUsd: 0.06,
        latencyMs: 100,
        requestId: "req-190-margin",
        owningEntityIds: { familyId: guardian.familyId },
        attemptType: "image",
        outcome: "succeeded",
      });
      const after = meter.deriveMarginEvidence(guardian.familyId)!;
      expect(after.attributableCogsUsd).toBe(0.06);
      expect(
        computeMarginPercent(after.netSubscriptionRevenueUsd, after.attributableCogsUsd)
      ).toBeLessThan(100);

      // No active subscription = no revenue evidence (fail closed upstream).
      const freeGuardian = ctx.onboarding.ensureFamilyForNewUser("auth-190-mg-free", "free@example.com");
      expect(meter.deriveMarginEvidence(freeGuardian.familyId)).toBeNull();
    });
  });
});
