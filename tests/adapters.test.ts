import { describe, expect, it } from "vitest";
import {
  FakeAnthropic,
  FakeFal,
  FakeLiveness,
  FakeModeration,
  StubAnthropic,
  StubFal,
  StubLiveness,
  StubModeration,
} from "@/adapters/fakes";

describe("provider adapter contracts", () => {
  it("stubs throw when not configured", async () => {
    await expect(new StubAnthropic().generateStory({
      brief: "x",
      personaNames: [],
      pageCount: 1,
    })).rejects.toThrow(/not configured/);
    await expect(new StubFal().startTraining([])).rejects.toThrow(/not configured/);
    await expect(new StubModeration().checkText("x")).rejects.toThrow(/not configured/);
    await expect(new StubLiveness().verifySelfie([], Buffer.alloc(1))).rejects.toThrow(
      /not configured/
    );
  });

  it("fakes conform to adapter interfaces", async () => {
    const anthropic = new FakeAnthropic();
    const story = await anthropic.generateStory({
      brief: "test",
      personaNames: ["A"],
      pageCount: 12,
    });
    expect(story.pages).toHaveLength(12);

    const fal = new FakeFal();
    const job = await fal.startTraining([Buffer.from("photo")]);
    expect(job.jobId).toBeDefined();

    const mod = new FakeModeration();
    expect((await mod.checkText("safe")).allowed).toBe(true);

    const liveness = new FakeLiveness();
    expect((await liveness.verifySelfie([], Buffer.alloc(1))).matched).toBe(true);
  });
});
