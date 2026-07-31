import Anthropic from "@anthropic-ai/sdk";
import type {
  AnthropicAdapter,
  ClassicSourceTale,
  TextStoryGenerationInput,
} from "@/adapters/types";
import type { GeneratedStory, StoryType, TraitQuestionnaire } from "@/domain/types";
import { requireEnv } from "@/adapters/env";

// Sonnet 4.6 remains the production default. Sonnet 5 is opt-in only after the
// fixed golden-set quality/latency/cost decision is recorded by the caller.
export const SONNET_4_6_MODEL = "claude-sonnet-4-6";
export const SONNET_5_MODEL = "claude-sonnet-5";
export interface SonnetRoutingDecision {
  sonnet5GoldenSetWins?: boolean;
}

export function getProductionStoryModel(
  decision: SonnetRoutingDecision = {}
): string {
  return decision.sonnet5GoldenSetWins === true ? SONNET_5_MODEL : SONNET_4_6_MODEL;
}

// R1's output safety ceiling is intentionally above the old 16K default; the
// retained stop-reason/usage evidence distinguishes capacity from spend.
const MAX_TOKENS = 24000;

/**
 * JSON schema for the single structured pass (ADR-0012): Story text +
 * per-Page Scenes + Style Bible, matching `GeneratedStory` exactly.
 */
const GENERATED_STORY_SCHEMA = {
  type: "object" as const,
  properties: {
    text: {
      type: "string",
      description: "The full Story text, the source of truth for every Page.",
    },
    pages: {
      type: "array",
      description: "Exactly one entry per Page, in reading order.",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", description: "0-based Page index." },
          text: {
            type: "string",
            description: "1–3 short, simple read-aloud sentences for this Page.",
          },
        },
        required: ["index", "text"],
        additionalProperties: false,
      },
    },
    scenes: {
      type: "array",
      description: "Exactly one Scene per Page, same order as pages.",
      items: {
        type: "object",
        properties: {
          pageIndex: { type: "integer" },
          description: {
            type: "string",
            description:
              "The illustration request: setting, action, mood. Wholesome, clothed, age-appropriate.",
          },
          personaIds: {
            type: "array",
            items: { type: "string" },
            description: "Names of the cast members present in this Scene.",
          },
        },
        required: ["pageIndex", "description", "personaIds"],
        additionalProperties: false,
      },
    },
    styleBible: {
      type: "object",
      description:
        "Book-level visual constants every Page must respect (ADR-0012).",
      properties: {
        palette: { type: "string" },
        // Structured outputs cannot express a free-form map, so wardrobe
        // travels as entries and is folded into a Record after parsing.
        wardrobe: {
          type: "array",
          description:
            "One entry per cast member: their fixed wardrobe/appearance for the whole book.",
          items: {
            type: "object",
            properties: {
              castMember: { type: "string" },
              outfit: { type: "string" },
            },
            required: ["castMember", "outfit"],
            additionalProperties: false,
          },
        },
        artStyle: { type: "string" },
      },
      required: ["palette", "wardrobe", "artStyle"],
      additionalProperties: false,
    },
  },
  required: ["text", "pages", "scenes", "styleBible"],
  additionalProperties: false,
};

interface WireGeneratedStory {
  text: string;
  pages: { index: number; text: string }[];
  scenes: { pageIndex: number; description: string; personaIds: string[] }[];
  styleBible: {
    palette: string;
    wardrobe: { castMember: string; outfit: string }[];
    artStyle: string;
  };
}

export type StoryGenerationOutcome = "success" | "refusal" | "max_tokens" | "provider_error";

export interface AnthropicGenerationEvidence {
  model: string;
  outcome: StoryGenerationOutcome;
  providerRequestId?: string;
  stopReason?: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
}

/** Semantic contract checked after JSON-schema parsing and before spend. */
export function validateGeneratedStoryContract(
  story: GeneratedStory,
  expectedPageCount = 12,
  selectedPersonaIds: string[] = []
): void {
  if (!story.text?.trim()) throw new Error("Story text is empty");
  if (story.pages.length !== expectedPageCount) {
    throw new Error(`Story must contain exactly ${expectedPageCount} Pages`);
  }
  if (story.scenes.length !== expectedPageCount) {
    throw new Error(`Story must contain exactly ${expectedPageCount} Scenes`);
  }
  story.pages.forEach((page, index) => {
    if (page.index !== index) throw new Error("Page indexes must be sequential from 0");
    if (!page.text?.trim()) throw new Error(`Page ${index} text is empty`);
  });
  story.scenes.forEach((scene, index) => {
    if (scene.pageIndex !== index) throw new Error("Scene indexes must be sequential from 0");
    if (!scene.description?.trim()) throw new Error(`Scene ${index} description is empty`);
    if (scene.personaIds.some((id) => !selectedPersonaIds.includes(id))) {
      throw new Error("Scenes may use selected Persona IDs only");
    }
  });
  if (
    !story.styleBible ||
    !story.styleBible.palette?.trim() ||
    !story.styleBible.artStyle?.trim() ||
    !story.styleBible.wardrobe ||
    typeof story.styleBible.wardrobe !== "object"
  ) {
    throw new Error("Story Style Bible is incomplete");
  }
  for (const personaId of selectedPersonaIds) {
    if (!story.styleBible.wardrobe[personaId]?.trim()) {
      throw new Error(`Story Style Bible is missing a wardrobe entry for Persona ${personaId}`);
    }
  }
}

/** Story Type shapes the narrative arc, not just the theme (CONTEXT.md). */
function storyTypeInstructions(storyType: StoryType): string {
  const t = storyType === "learning" ? "lesson" : storyType;
  const map: Record<string, string> = {
    everyday:
      "STORY TYPE: Everyday moment. A small, real slice of the child's day — familiar places, gentle rhythms, cozy details.",
    milestone:
      "STORY TYPE: Big milestone. Celebrate a first or special moment with warmth and pride; build toward a joyful reveal.",
    adventure:
      "STORY TYPE: Little adventure. A brave quest in a safe, whimsical world; mild stakes, happy resolution.",
    lesson:
      "STORY TYPE: Gentle lesson. Weave sharing, kindness, or big feelings into the plot; the lesson resolves clearly by the final page.",
    bedtime:
      "STORY TYPE: Bedtime calm. Calming wind-down arc ending in rest, warmth, and safety — no cliffhangers or peril.",
    silly:
      "STORY TYPE: Silly & giggly. Playful nonsense, sound effects, and happy absurdity; keep it age-appropriate and joyful.",
  };
  return map[t] ?? map.lesson!;
}

const SAFETY_CONSTRAINTS = [
  "SAFETY (non-negotiable): every Scene must be wholesome, fully clothed, and age-appropriate",
  "for children aged 1–6. No violence, fear, weapons, injury, romance, or innuendo of any kind.",
].join(" ");

function buildClient(): Anthropic {
  return new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
}

function parseGeneratedStory(message: Anthropic.Message): GeneratedStory {
  if (message.stop_reason === "refusal") {
    throw new Error("Story generation was refused by the model's safety system");
  }
  // Issue 162: a max_tokens stop means the JSON was truncated mid-output —
  // JSON.parse would throw an opaque SyntaxError. Surface a clear, actionable
  // diagnostic so the caller (runGenerationBody) forces the book to terminal
  // `failed` with a useful error instead of a cryptic parse failure.
  if (message.stop_reason === "max_tokens") {
    throw new Error(
      "Story generation hit the max_tokens limit (truncated JSON) — increase MAX_TOKENS or reduce page count"
    );
  }
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("Story generation returned no text content");
  }
  let wire: WireGeneratedStory;
  try {
    wire = JSON.parse(block.text) as WireGeneratedStory;
  } catch {
    throw new Error(
      "Story generation returned malformed JSON (could not parse the structured output)"
    );
  }
  if (!Array.isArray(wire.pages) || !Array.isArray(wire.scenes) || !wire.styleBible) {
    throw new Error("Story generation returned malformed structured output");
  }
  const wardrobe: Record<string, string> = {};
  for (const entry of wire.styleBible.wardrobe ?? []) {
    wardrobe[entry.castMember] = entry.outfit;
  }
  return {
    text: wire.text,
    pages: wire.pages,
    scenes: wire.scenes,
    styleBible: {
      palette: wire.styleBible.palette,
      wardrobe,
      artStyle: wire.styleBible.artStyle,
    },
  };
}

/**
 * Real Claude adapter for Story text (ADR-0012: one structured pass yields
 * Story + per-Page Scenes + Style Bible). Mirrors FakeAnthropic's contract.
 */
export class RealAnthropicAdapter implements AnthropicAdapter {
  public lastGenerationEvidence: AnthropicGenerationEvidence | undefined;

  constructor(private readonly routingDecision: SonnetRoutingDecision = {}) {}

  private recordEvidence(message: Anthropic.Message): void {
    const outcome: StoryGenerationOutcome =
      message.stop_reason === "refusal"
        ? "refusal"
        : message.stop_reason === "max_tokens"
          ? "max_tokens"
          : "success";
    this.lastGenerationEvidence = {
      model: getProductionStoryModel(this.routingDecision),
      outcome,
      providerRequestId: message.id,
      stopReason: message.stop_reason ?? undefined,
      inputTokens: message.usage?.input_tokens ?? 0,
      outputTokens: message.usage?.output_tokens ?? 0,
    };
  }

  async generateStory(input: {
    brief: string;
    personaNames: string[];
    personaIds?: string[];
    characterNames?: string[];
    pageCount: number;
    storyType: StoryType;
    lullabyPhrase?: string;
    momentContext?: string;
  }): Promise<GeneratedStory> {
    const client = buildClient();
    const castLine = [
      input.personaNames.length ? `CAST NAMES (use in story prose): ${input.personaNames.join(", ")}.` : "",
      input.personaIds?.length
        ? `CAST PERSONA IDS (use these exact IDs in scenes.personaIds and styleBible.wardrobe.castMember): ${input.personaIds.join(", ")}.`
        : "",
      input.characterNames?.length
        ? `FICTIONAL CHARACTERS (use these exact names): ${input.characterNames.join(", ")}.`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const lullabyLine = input.lullabyPhrase
      ? `LULLABY WEAVE: The final page must naturally lead into this exact recorded phrase: "${input.lullabyPhrase}".`
      : "";

    let message: Anthropic.Message;
    try {
      message = await client.messages.create({
        model: getProductionStoryModel(this.routingDecision),
        max_tokens: MAX_TOKENS,
        system: [
          "You are Lullabook's storyteller: you write personalized picture-book Stories starring",
          "a real family's cast, for a parent to read aloud to a child aged 1–6.",
          SAFETY_CONSTRAINTS,
          "In ONE pass produce: the Story text, exactly the requested number of Pages",
          "(1–3 short simple sentences each), one Scene per Page, and a Style Bible that keeps",
          "wardrobe, palette, and art style identical across every Page.",
          "Scenes' personaIds and Style Bible wardrobe castMember values must use the exact cast Persona IDs provided.",
        ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            storyTypeInstructions(input.storyType),
            castLine,
            lullabyLine,
            input.momentContext,
            `PAGE COUNT: exactly ${input.pageCount} pages, indexes 0 through ${input.pageCount - 1}.`,
            `BRIEF: ${input.brief}`,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: GENERATED_STORY_SCHEMA,
        },
      },
      });
    } catch (error) {
      this.lastGenerationEvidence = {
        model: getProductionStoryModel(this.routingDecision),
        outcome: "provider_error",
        inputTokens: 0,
        outputTokens: 0,
        error: error instanceof Error ? error.message : String(error),
      };
      throw error;
    }
    this.recordEvidence(message);
    const story = parseGeneratedStory(message);
    validateGeneratedStoryContract(story, input.pageCount, input.personaIds ?? input.personaNames);
    return story;
  }

  async generateTextStory(input: TextStoryGenerationInput): Promise<{ text: string }> {
    const client = buildClient();
    const castLines = input.characters.map((c) => {
      const q = c.questionnaire;
      const traits = [
        q.nickname ? `nickname "${q.nickname}"` : null,
        q.relationships?.length ? `family: ${q.relationships.join(", ")}` : null,
        q.favoriteAnimals?.length ? `favorite animals: ${q.favoriteAnimals.join(", ")}` : null,
        q.favoriteToys?.length ? `favorite toys: ${q.favoriteToys.join(", ")}` : null,
        q.songs?.length ? `favorite songs: ${q.songs.join(", ")}` : null,
        q.topics?.length ? `loves: ${q.topics.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join("; ");
      return `- ${c.displayName}${traits ? ` (${traits})` : ""}`;
    });

    const message = await client.messages.create({
      model: getProductionStoryModel(this.routingDecision),
      max_tokens: MAX_TOKENS,
      system: [
        "You are Lullabook's storyteller: you write short personalized read-aloud Stories",
        "starring the Characters described by their Trait Questionnaires, for children aged 1–6.",
        SAFETY_CONSTRAINTS,
        "Weave the Characters' traits, names, and favorites naturally into the narrative.",
        "Write plain prose only — no headings, no markdown.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            storyTypeInstructions(input.storyType),
            `CAST:\n${castLines.join("\n")}`,
            `THEME: ${input.theme}`,
            input.note ? `SPECIAL NOTE: ${input.note}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      throw new Error("Story generation was refused by the model's safety system");
    }
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("Text Story generation returned no content");
    }
    return { text: block.text };
  }

  async generateCharacterDescription(
    questionnaire: TraitQuestionnaire
  ): Promise<{ description: string }> {
    const client = buildClient();
    const traits = [
      questionnaire.topics?.length ? `traits: ${questionnaire.topics.join(", ")}` : null,
      questionnaire.nickname ? `nickname "${questionnaire.nickname}"` : null,
      questionnaire.favoriteAnimals?.length
        ? `favorite animals: ${questionnaire.favoriteAnimals.join(", ")}`
        : null,
      questionnaire.favoriteToys?.length
        ? `favorite toys: ${questionnaire.favoriteToys.join(", ")}`
        : null,
      questionnaire.songs?.length ? `favorite songs: ${questionnaire.songs.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    const message = await client.messages.create({
      model: getProductionStoryModel(this.routingDecision),
      max_tokens: 80,
      system: [
        "You write ONE short, warm, whimsical sentence (max ~20 words) describing a",
        "made-up, fictional Character for a child's storybook app, in the third person.",
        "Keep it simple and concrete — a single sentence, never two.",
        SAFETY_CONSTRAINTS,
        "Return ONLY the description text — no quotes, no preamble, no markdown.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: `Describe this fictional Character named "${questionnaire.name}"${
            traits ? ` (${traits})` : ""
          }.`,
        },
      ],
    });

    if (message.stop_reason === "refusal") {
      throw new Error("Character description was refused by the model's safety system");
    }
    const block = message.content.find((b) => b.type === "text");
    if (!block || block.type !== "text") {
      throw new Error("Character description generation returned no content");
    }
    return { description: block.text.trim() };
  }

  async adaptStory(input: {
    sourceTale: ClassicSourceTale;
    personaNames: string[];
    personaIds?: string[];
    pageCount: number;
    storyType: StoryType;
    twist?: string;
  }): Promise<GeneratedStory> {
    const client = buildClient();
    const message = await client.messages.create({
      model: getProductionStoryModel(this.routingDecision),
      max_tokens: MAX_TOKENS,
      system: [
        "You are Lullabook's storyteller adapting a public-domain classic into a Personalized",
        "Classic (ADR-0017): adapt-and-recast, do not invent a new plot.",
        "Preserve the source tale's plot beats in order; recast its characters as the family's",
        "cast members; re-style the telling to the requested Story Type.",
        SAFETY_CONSTRAINTS,
        "In ONE pass produce: the Story text, exactly the requested number of Pages",
        "(1–3 short simple sentences each), one Scene per Page, and a Style Bible that keeps",
        "wardrobe, palette, and art style identical across every Page.",
        "Scenes' personaIds and Style Bible wardrobe castMember values must use the exact cast Persona IDs provided.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: [
            storyTypeInstructions(input.storyType),
            `SOURCE TALE: "${input.sourceTale.title}".`,
            `PLOT BEATS (preserve in order):\n${input.sourceTale.plotBeats
              .map((b, i) => `${i + 1}. ${b}`)
              .join("\n")}`,
            `CAST NAMES (recast the tale's characters in prose): ${input.personaNames.join(", ")}.`,
            input.personaIds?.length
              ? `CAST PERSONA IDS (use these exact IDs in scenes.personaIds and styleBible.wardrobe.castMember): ${input.personaIds.join(", ")}.`
              : null,
            `PAGE COUNT: exactly ${input.pageCount} pages, indexes 0 through ${input.pageCount - 1}.`,
            input.twist ? `CUSTOM TWIST (already moderated): ${input.twist}` : null,
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: GENERATED_STORY_SCHEMA,
        },
      },
    });
    this.recordEvidence(message);
    const story = parseGeneratedStory(message);
    validateGeneratedStoryContract(story, input.pageCount, input.personaIds ?? input.personaNames);
    return story;
  }
}
