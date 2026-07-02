import { describe, expect, it, beforeAll, afterAll } from "vitest";
import {
  createTestContext,
  createReadyAdult,
  generateAndWait,
  householdWithBaby,
} from "@/test/fixtures";
import { SHORT_PAGE_COUNT } from "@/domain/story-type";

// Issue 145 — these tests exercise the R2 voice/lullaby path, so opt back into
// audio (the R1 default is cut). The flag restores the pre-cut narration gate.
beforeAll(() => { process.env.R1_AUDIO_ENABLED = "true"; });
afterAll(() => { delete process.env.R1_AUDIO_ENABLED; });

describe("39 — voice in stories + lullaby weave", () => {
  it("weaves a lullaby clip into the final page", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);
    const adult = await createReadyAdult(ctx, guardian, "Nani");
    ctx.voiceClips.recordConsent(guardian.id, adult.id);
    const lullaby = await ctx.voiceClips.uploadClip({
      memberId: guardian.id,
      personaId: adult.id,
      label: "Lullaby",
      transcript: "Hush now my little moonbeam",
      durationSecs: 42,
      audioBytes: Buffer.from("audio"),
    });

    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id, adult.id],
      babyId: guardian.selectedBabyId ?? undefined,
      storyType: "bedtime",
      theme: "Garden evening",
      pageCount: SHORT_PAGE_COUNT,
      lullabyClipId: lullaby.id,
    });

    const pages = ctx.store.getPagesForStorybook(book.id);
    const last = pages[pages.length - 1]!;
    expect(last.voiceClipId).toBe(lullaby.id);
    expect(last.text).toContain("moonbeam");

    const call = ctx.anthropic.calls[0] as { lullabyPhrase?: string };
    expect(call.lullabyPhrase).toContain("moonbeam");
  });

  it("assigns voice clips per page for reader playback", async () => {
    const ctx = createTestContext();
    const { guardian, babyPersona } = await householdWithBaby(ctx);
    const book = await generateAndWait(ctx, guardian.id, {
      starringPersonaIds: [babyPersona.id],
      storyType: "everyday",
      theme: "Morning",
      pageCount: SHORT_PAGE_COUNT,
      voiceClipIds: [],
    });

    const clipId = ctx.storybooks.getVoiceClipForPage(
      book.brief,
      0,
      SHORT_PAGE_COUNT
    );
    expect(clipId).toBeNull();
  });
});
