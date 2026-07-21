import { describe, expect, it } from "vitest";
import { FakeFal } from "@/adapters/fakes";
import type { FalImageResult } from "@/adapters/types";
import {
  createTestContext,
  goodPhoto,
  withActiveSubscription,
} from "@/test/fixtures";

interface PageRequest {
  pageIndex: number;
  prompt: string;
  loras: { personaId: string; path: string; scale: number }[];
  personaIds: string[];
  styleBible: unknown;
  seed: number;
  seedMetadata: { storybookId: string; pageIndex: number; algorithm: string };
  provider: string;
  model: string;
  modelVersion: string;
  endpoint: string;
  safety: { enabled: boolean };
  idempotencyKey: string;
}

interface RepairRequest extends PageRequest {
  tier: string;
  referenceImageUrls: string[];
}

/** A deterministic, entirely local provider spy for ticket 182. */
class Ticket182Fal extends FakeFal {
  pageRequests: PageRequest[] = [];
  repairRequests: RepairRequest[] = [];
  inpaintCallCount = 0;
  inFlight = 0;
  maxInFlight = 0;
  delayMs = 0;
  failedPages = new Set<number>();
  failedRepairTiers = new Set<string>();

  override async inpaintFaces(
    baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult> {
    this.inpaintCallCount++;
    return super.inpaintFaces(baseImageUrl, faces);
  }

  async generatePageImage(input: unknown): Promise<FalImageResult> {
    const request = input as PageRequest;
    this.pageRequests.push(request);
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    this.inFlight--;
    if (this.failedPages.has(request.pageIndex)) {
      throw new Error(`page ${request.pageIndex} failed`);
    }
    return {
      imageUrl: `memory://page/${request.pageIndex}`,
      bytes: Buffer.from(`page-${request.pageIndex}`),
    };
  }

  async repairPageImage(input: unknown): Promise<FalImageResult> {
    const request = input as RepairRequest;
    this.repairRequests.push(request);
    if (this.failedRepairTiers.has(request.tier)) {
      throw new Error(`${request.tier} repair failed`);
    }
    return {
      imageUrl: `memory://repair/${request.pageIndex}/${request.tier}`,
      bytes: Buffer.from(`repaired-page-${request.pageIndex}`),
    };
  }
}

async function threeReadyPersonas(ctx: ReturnType<typeof createTestContext<Ticket182Fal>>) {
  const member = ctx.onboarding.ensureFamilyForNewUser("auth-182", "182@example.com");
  withActiveSubscription(ctx, member);
  const personas = [];
  for (const [i, displayName] of ["Baby", "Guardian", "Sibling"].entries()) {
    personas.push(
      await ctx.personas.createAdult({
        memberId: member.id,
        displayName,
        photos: [goodPhoto(0xaa + i), goodPhoto(0xaa + i), goodPhoto(0xaa + i)],
        selfie: Buffer.from(`selfie-${i}`),
      })
    );
  }
  return { member, personas };
}

describe("182 — concurrent multi-Persona Page generation and bounded repair", () => {
  it("passes one to three Persona LoRAs in one request per Page, never fake face masks", async () => {
    const fal = new Ticket182Fal();
    const ctx = createTestContext({ fal });
    const { member, personas } = await threeReadyPersonas(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: personas.map((persona) => persona.id),
      storyType: "bedtime",
      theme: "three friends",
    });
    await ctx.workflow.drain();

    expect(fal.pageRequests).toHaveLength(12);
    expect(fal.pageRequests.every((request) => Boolean(request.loras))).toBe(true);
    expect(fal.pageRequests.every((request) => request.loras.length === 3)).toBe(true);
    expect(fal.pageRequests.every((request) => request.loras.every((lora) => !/^face-\d+$/.test(lora.path)))).toBe(true);
    expect(fal.inpaintCallCount).toBe(0);
    expect(fal.pageRequests.every((request) => Boolean(request.personaIds))).toBe(true);
    expect(fal.pageRequests.every((request) => request.personaIds.join(",") === personas.map((p) => p.id).join(","))).toBe(true);
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("draft");
  });

  it("fans out twelve Page jobs with bounded concurrency and beats sequential latency", async () => {
    const fal = new Ticket182Fal();
    fal.delayMs = 25;
    const ctx = createTestContext({ fal });
    const { member, personas } = await threeReadyPersonas(ctx);
    const startedAt = Date.now();

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: personas.map((persona) => persona.id),
      storyType: "learning",
      theme: "counting stars",
    });
    await ctx.workflow.drain();

    const elapsedMs = Date.now() - startedAt;
    expect(fal.pageRequests).toHaveLength(12);
    expect(fal.maxInFlight).toBeGreaterThan(1);
    expect(fal.maxInFlight).toBeLessThanOrEqual(4);
    expect(elapsedMs).toBeLessThan(12 * fal.delayMs);
    expect(ctx.store.getPagesForStorybook(book.id)).toHaveLength(12);
  });

  it("carries the same Style Bible, deterministic seed metadata, cast, and model version on every Page", async () => {
    const fal = new Ticket182Fal();
    const ctx = createTestContext({ fal });
    const { member, personas } = await threeReadyPersonas(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: personas.slice(0, 2).map((persona) => persona.id),
      storyType: "bedtime",
      theme: "same visual world",
    });
    await ctx.workflow.drain();

    const [first, ...rest] = fal.pageRequests;
    expect(first).toBeDefined();
    expect(rest.every((request) => request.styleBible === first.styleBible || JSON.stringify(request.styleBible) === JSON.stringify(first.styleBible))).toBe(true);
    expect(rest.every((request) => request.seedMetadata.algorithm === "storybook-page-seed-v1")).toBe(true);
    expect(new Set(fal.pageRequests.map((request) => request.modelVersion)).size).toBe(1);
    expect(new Set(fal.pageRequests.map((request) => request.provider)).size).toBe(1);
    expect(new Set(fal.pageRequests.map((request) => request.endpoint)).size).toBe(1);
    expect(fal.pageRequests.every((request) => request.safety.enabled)).toBe(true);
    expect(fal.pageRequests.every((request) => request.idempotencyKey === `${book.id}/${request.pageIndex}/0/fal-generate`)).toBe(true);
  });

  it("keeps a failed Page as a visible re-rollable hole while successful Pages and text stay draft", async () => {
    const fal = new Ticket182Fal();
    fal.failedPages.add(3);
    const ctx = createTestContext({ fal });
    const { member, personas } = await threeReadyPersonas(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: personas.map((persona) => persona.id),
      storyType: "bedtime",
      theme: "one cloudy page",
    });
    await ctx.workflow.drain();

    const pages = ctx.store.getPagesForStorybook(book.id);
    const failed = pages.find((page) => page.index === 3)!;
    expect(failed.generationStatus).toBe("failed");
    expect(failed.text).toContain("Page 4");
    expect(failed.illustrationBlobKey).toBeNull();
    expect(pages.filter((page) => page.generationStatus === "ready")).toHaveLength(11);
    expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("draft");
  });

  it("tries Nano Banana 2 Edit before Pro, bounds repair, and never regenerates the whole book", async () => {
    const fal = new Ticket182Fal();
    fal.failedPages.add(1);
    fal.failedRepairTiers.add("nano-banana-2-edit");
    const ctx = createTestContext({ fal });
    const { member, personas } = await threeReadyPersonas(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: personas.slice(0, 2).map((persona) => persona.id),
      storyType: "bedtime",
      theme: "selective repair",
    });
    await ctx.workflow.drain();
    const generatedPageCount = fal.pageRequests.length;
    const failedPage = ctx.store.getPagesForStorybook(book.id).find((page) => page.index === 1)!;

    ctx.storybooks.recoverPage(member.id, failedPage.id);
    await ctx.workflow.drain();

    expect(fal.pageRequests).toHaveLength(generatedPageCount);
    expect(fal.repairRequests.map((request) => request.tier)).toEqual([
      "nano-banana-2-edit",
      "nano-banana-pro-edit",
    ]);
    expect(ctx.store.pages.get(failedPage.id)?.generationStatus).toBe("ready");
  });

  it("application moderation rejects unsafe generated output while provider safety remains enabled", async () => {
    const fal = new Ticket182Fal();
    fal.failedPages.add(4);
    const ctx = createTestContext({ fal });
    ctx.moderation.blockedImageContents = ["page-2"];
    const { member, personas } = await threeReadyPersonas(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: personas.map((persona) => persona.id),
      storyType: "learning",
      theme: "safe output",
    });
    await ctx.workflow.drain();

    const blocked = ctx.store.getPagesForStorybook(book.id).find((page) => page.index === 2)!;
    expect(blocked.generationStatus).toBe("quarantined");
    expect(fal.pageRequests.every((request) => request.safety.enabled)).toBe(true);
    expect([...ctx.store.moderationAudit.values()].some((entry) => entry.resourceType === "generated_image" && entry.outcome === "quarantined")).toBe(true);
  });

  it("does not turn a dev placeholder fallback into production success", async () => {
    const env = process.env as unknown as { NODE_ENV?: string };
    const previousNodeEnv = env.NODE_ENV;
    env.NODE_ENV = "production";
    try {
      const fal = new Ticket182Fal();
      const ctx = createTestContext({ fal });
      const { member, personas } = await threeReadyPersonas(ctx);
      const book = await ctx.storybooks.generate(member.id, {
        starringPersonaIds: personas.slice(0, 1).map((persona) => persona.id),
        storyType: "bedtime",
        theme: "production guard",
      });

      await expect(ctx.workflow.drain()).rejects.toThrow(/production|fallback|provider/i);
      expect(ctx.store.getStorybook(book.id, member.id)?.status).toBe("failed");
      expect(ctx.store.getPagesForStorybook(book.id).some((page) => page.illustrationBlobKey?.startsWith("books/") ?? false)).toBe(false);
    } finally {
      if (previousNodeEnv === undefined) delete env.NODE_ENV;
      else env.NODE_ENV = previousNodeEnv;
    }
  });
});
