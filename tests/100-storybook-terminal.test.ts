import { describe, expect, it, vi } from "vitest";
import { createTestContext, generateAndWait, goodPhoto, withActiveSubscription } from "@/test/fixtures";

/**
 * Issue 100 — Generation always reaches a terminal state on EVERY workflow
 * adapter (Inngest, local-dev, FakeWorkflow). The "never strand in
 * `generating`" backstop previously lived only in the Inngest function; these
 * tests pin it inside the service so the local-dev path the app actually runs
 * can't strand a book either.
 */
describe("100 — generation always reaches a terminal state", () => {
  async function readyMember(ctx: ReturnType<typeof createTestContext>) {
    const member = ctx.onboarding.ensureFamilyForNewUser("auth-100", "term@example.com");
    withActiveSubscription(ctx, member);
    const persona = await ctx.personas.createAdult({
      memberId: member.id,
      displayName: "Star",
      photos: [goodPhoto(), goodPhoto(), goodPhoto()],
      selfie: Buffer.from("selfie"),
    });
    return { member, persona };
  }

  it("marks a book `failed` (never `generating`) when the claude pass throws on the local-dev path", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    vi.spyOn(ctx.anthropic, "generateStory").mockRejectedValue(
      new Error("Claude outage")
    );

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "stuck",
    });

    // The local-dev / FakeWorkflow drain runs runGenerationBody inline. The
    // service backstop must force the book terminal before re-throwing so the
    // reader never polls a stranded `generating` book.
    await expect(ctx.workflow.drain()).rejects.toThrow("Claude outage");

    const stored = ctx.store.getStorybook(book.id, member.id)!;
    expect(stored.status).toBe("failed");
  });

  it("watchdog reaps a book stranded in `generating` past the budget", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "stranded",
    });
    // Don't drain — simulate a workflow run that never completed (crash/hang).
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("generating");

    const budgetMs = 5 * 60 * 1000;
    const past = new Date(book.createdAt.getTime() + budgetMs + 1);
    const reaped = ctx.storybooks.reapStrandedGenerations(past, budgetMs);

    expect(reaped).toBe(1);
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("failed");
  });

  it("watchdog leaves a book still within the budget alone", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);

    const book = await ctx.storybooks.generate(member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "in-flight",
    });
    const budgetMs = 5 * 60 * 1000;
    const within = new Date(book.createdAt.getTime() + budgetMs - 1);

    const reaped = ctx.storybooks.reapStrandedGenerations(within, budgetMs);

    expect(reaped).toBe(0);
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("generating");
  });

  it("watchdog never downgrades a book already in a terminal state", async () => {
    const ctx = createTestContext();
    const { member, persona } = await readyMember(ctx);
    // A finished (draft) book that happens to be older than the budget must
    // not be touched — the watchdog only reaps `generating`.
    const book = await generateAndWait(ctx, member.id, {
      starringPersonaIds: [persona.id],
      storyType: "bedtime",
      theme: "done",
    });
    expect(book.status).toBe("draft");

    const budgetMs = 1;
    const reaped = ctx.storybooks.reapStrandedGenerations(
      new Date(book.createdAt.getTime() + 60_000),
      budgetMs
    );

    expect(reaped).toBe(0);
    expect(ctx.store.getStorybook(book.id, member.id)!.status).toBe("draft");
  });
});
