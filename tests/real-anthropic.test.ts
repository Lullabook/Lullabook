import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class FakeAnthropicSdk {
    // The adapter streams at MAX_TOKENS (the SDK refuses a non-streaming
    // request that large) and resolves via finalMessage(). Route both shapes
    // through the same mock so call-argument assertions keep working.
    messages = {
      create: createMock,
      stream: (args: unknown) => ({ finalMessage: () => createMock(args) }),
    };
    constructor(_opts: unknown) {}
  },
}));

import { RealAnthropicAdapter } from "@/adapters/anthropic";

const WIRE_STORY = {
  text: "Nova sails to the moon and back to bed.",
  pages: [
    { index: 0, text: "Nova put on her star boots." },
    { index: 1, text: "She sailed up, up, up — then home to bed." },
  ],
  scenes: [
    { pageIndex: 0, description: "Nova lacing star boots", personaIds: ["Nova"] },
    { pageIndex: 1, description: "Nova asleep under a quilt", personaIds: ["Nova"] },
  ],
  styleBible: {
    palette: "dusk lavender and warm amber",
    wardrobe: [{ castMember: "Nova", outfit: "yellow star boots and a navy onesie" }],
    artStyle: "soft watercolor",
  },
};

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
  createMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("RealAnthropicAdapter", () => {
  it("requests one structured pass and folds wardrobe entries into a Record", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(WIRE_STORY) }],
    });

    const story = await new RealAnthropicAdapter().generateStory({
      brief: "a trip to the moon",
      personaNames: ["Nova"],
      pageCount: 2,
      storyType: "bedtime",
    });

    const req = createMock.mock.calls[0][0];
    expect(req.model).toBe("claude-sonnet-4-6");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.system).toContain("wholesome");
    expect(String(req.messages[0].content)).toContain("Bedtime");

    expect(story.pages).toHaveLength(2);
    expect(story.styleBible.wardrobe).toEqual({
      Nova: "yellow star boots and a navy onesie",
    });
  });

  it("branches the instruction set on storyType", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(WIRE_STORY) }],
    });

    await new RealAnthropicAdapter().generateStory({
      brief: "counting ducks",
      personaNames: ["Nova"],
      pageCount: 2,
      storyType: "learning",
    });

    expect(String(createMock.mock.calls[0][0].messages[0].content)).toContain("Gentle lesson");
  });

  it("surfaces a model refusal as an error", async () => {
    createMock.mockResolvedValue({ stop_reason: "refusal", content: [] });

    await expect(
      new RealAnthropicAdapter().generateStory({
        brief: "x",
        personaNames: [],
        pageCount: 1,
        storyType: "bedtime",
      })
    ).rejects.toThrow(/refused/);
  });

  it("adaptStory preserves the classic's plot beats in the prompt", async () => {
    createMock.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(WIRE_STORY) }],
    });

    await new RealAnthropicAdapter().adaptStory({
      sourceTale: {
        id: "goldilocks",
        title: "Goldilocks and the Three Bears",
        plotBeats: ["A curious child finds a house in the woods"],
      },
      personaNames: ["Nova"],
      pageCount: 2,
      storyType: "bedtime",
    });

    const content = String(createMock.mock.calls[0][0].messages[0].content);
    expect(content).toContain("Goldilocks and the Three Bears");
    expect(content).toContain("A curious child finds a house in the woods");
  });
});
