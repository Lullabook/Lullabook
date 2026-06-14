import type {
  AnthropicAdapter,
  ClassicCatalog,
  ClassicSourceTale,
  TextStoryGenerationInput,
  BlobStore,
  FalAdapter,
  FalImageResult,
  FalTrainResult,
  FalTrainWebhook,
  LivenessAdapter,
  ModerationAdapter,
  ModerationResult,
  NotificationAdapter,
  PdfAdapter,
  StripeAdapter,
  VideoAdapter,
  VideoClipResult,
  WorkflowAdapter,
  WorkflowStep,
} from "@/adapters/types";
import type { GeneratedStory } from "@/domain/types";

export class FakeClassicCatalog implements ClassicCatalog {
  public tales: ClassicSourceTale[] = [
    {
      id: "alice-in-wonderland",
      title: "Alice in Wonderland",
      plotBeats: ["Alice falls down the rabbit hole", "Alice meets the Cheshire Cat"],
    },
    {
      id: "princess-and-pea",
      title: "The Princess and the Pea",
      plotBeats: ["A prince seeks a true princess", "A pea proves her royalty"],
    },
  ];

  getById(id: string): ClassicSourceTale | null {
    return this.tales.find((t) => t.id === id) ?? null;
  }
}

export class FakeAnthropic implements AnthropicAdapter {
  public calls: unknown[] = [];
  public adaptCalls: unknown[] = [];
  public textStoryCalls: TextStoryGenerationInput[] = [];
  public characterDescriptionCalls: import("@/domain/types").TraitQuestionnaire[] = [];
  public textStoryResponse = { text: "Once upon a time, Emma went on a cozy forest adventure..." };
  public response: GeneratedStory = {
    text: "Once upon a time...",
    pages: Array.from({ length: 12 }, (_, i) => ({
      index: i,
      text: `Page ${i + 1} text`,
    })),
    scenes: Array.from({ length: 12 }, (_, i) => ({
      pageIndex: i,
      description: `Scene ${i + 1}`,
      personaIds: [],
    })),
    styleBible: {
      palette: "warm pastels",
      wardrobe: {},
      artStyle: "watercolor",
    },
  };

  async generateStory(input: {
    brief: string;
    personaNames: string[];
    characterNames?: string[];
    pageCount: number;
    storyType: import("@/domain/types").StoryType;
    lullabyPhrase?: string;
    lullabyTranscript?: string;
    momentContext?: string;
  }): Promise<GeneratedStory> {
    this.calls.push(input);
    if (this.response.pages.length === 0) {
      return this.response;
    }
    const transcript = input.lullabyPhrase ?? input.lullabyTranscript;
    const pages = Array.from({ length: input.pageCount }, (_, i) => ({
      index: i,
      text:
        transcript && i === input.pageCount - 1
          ? `…and softly: "${transcript}"`
          : `Page ${i + 1} text`,
    }));
    return {
      ...this.response,
      pages,
      scenes: Array.from({ length: input.pageCount }, (_, i) => ({
        pageIndex: i,
        description: `Scene ${i + 1}`,
        personaIds: [],
      })),
    };
  }

  async generateTextStory(input: TextStoryGenerationInput): Promise<{ text: string }> {
    this.textStoryCalls.push(input);
    return this.textStoryResponse;
  }

  async generateCharacterDescription(
    questionnaire: import("@/domain/types").TraitQuestionnaire
  ): Promise<{ description: string }> {
    this.characterDescriptionCalls.push(questionnaire);
    const traits = (questionnaire.topics ?? []).slice(0, 2).join(", ").toLowerCase();
    const lead = traits ? `A ${traits} friend` : "A gentle friend";
    return {
      description: `${lead} named ${questionnaire.name} who loves being part of the story.`,
    };
  }

  async adaptStory(input: {
    sourceTale: ClassicSourceTale;
    personaNames: string[];
    pageCount: number;
    storyType: import("@/domain/types").StoryType;
    twist?: string;
  }): Promise<GeneratedStory> {
    this.adaptCalls.push(input);
    return this.response;
  }
}

export class FakeFal implements FalAdapter {
  public trainCalls = 0;
  public imageCalls = 0;
  public imagePrompts: string[] = [];
  public idempotencyKeys: string[] = [];
  public failImageOnPage: number | null = null;
  public failPages = new Set<number>();
  public currentPage = 0;
  private jobs = new Map<string, FalTrainWebhook>();
  private imageResultsByKey = new Map<string, FalImageResult>();

  async startTraining(_photos: Buffer[]): Promise<FalTrainResult> {
    this.trainCalls++;
    const jobId = `job-${this.trainCalls}`;
    this.jobs.set(jobId, {
      jobId,
      status: "ready",
      loraWeightKey: `lora/${jobId}`,
      sampleImageUrls: [`https://example.com/sample-${jobId}.png`],
    });
    return { jobId, status: "queued" };
  }

  getWebhook(jobId: string): FalTrainWebhook | undefined {
    return this.jobs.get(jobId);
  }

  async generateImage(
    prompt: string,
    loraKey: string,
    options?: { idempotencyKey?: string }
  ): Promise<FalImageResult> {
    const idempotencyKey = options?.idempotencyKey;
    if (idempotencyKey && this.imageResultsByKey.has(idempotencyKey)) {
      return this.imageResultsByKey.get(idempotencyKey)!;
    }

    this.imageCalls++;
    this.imagePrompts.push(prompt);
    if (idempotencyKey) {
      this.idempotencyKeys.push(idempotencyKey);
    }
    this.currentPage++;
    if (
      this.failImageOnPage === this.currentPage ||
      this.failPages.has(this.currentPage)
    ) {
      throw new Error("Image generation failed");
    }
    const imageUrl = `https://example.com/${loraKey}/${this.currentPage}.png`;
    const result = { imageUrl, bytes: Buffer.from(`image-${this.currentPage}`) };
    if (idempotencyKey) {
      this.imageResultsByKey.set(idempotencyKey, result);
    }
    return result;
  }

  async inpaintFaces(
    baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult> {
    const imageUrl = `https://example.com/inpaint/${faces.length}.png`;
    return { imageUrl, bytes: Buffer.from(`inpaint-${faces.length}`) };
  }

  async generateWithReferenceModel(
    prompt: string,
    referenceImageUrls: string[]
  ): Promise<FalImageResult> {
    const imageUrl = `https://example.com/ref/${referenceImageUrls.length}.png`;
    return { imageUrl, bytes: Buffer.from(`ref-${referenceImageUrls.length}`) };
  }
}

export class FakeModeration implements ModerationAdapter {
  public blockedTexts: string[] = [];
  public blockedImages: number[] = [];
  public blockedImageContents: string[] = [];
  public blockedCsamImageContents: string[] = [];
  public audit: ModerationResult[] = [];

  async checkImage(image: Buffer): Promise<ModerationResult> {
    const content = image.toString();
    if (this.blockedCsamImageContents.some((pattern) => content.includes(pattern))) {
      const result = { allowed: false, reason: "unsafe image", csamDetected: true };
      this.audit.push(result);
      return result;
    }
    if (
      this.blockedImageContents.some((pattern) => content.includes(pattern)) ||
      this.blockedImages.includes(image.length)
    ) {
      const result = {
        allowed: false,
        reason: "unsafe image",
        csamDetected: this.blockedImages.includes(image.length),
      };
      this.audit.push(result);
      return result;
    }
    const result = { allowed: true };
    this.audit.push(result);
    return result;
  }

  async checkText(text: string): Promise<ModerationResult> {
    if (this.blockedTexts.some((t) => text.includes(t))) {
      const result = { allowed: false, reason: "unsafe text" };
      this.audit.push(result);
      return result;
    }
    const result = { allowed: true };
    this.audit.push(result);
    return result;
  }
}

export class FakeLiveness implements LivenessAdapter {
  public shouldMatch = true;
  public verifyCalls = 0;

  async verifySelfie(
    _photos: Buffer[],
    _selfie: Buffer
  ): Promise<{ matched: boolean; confidence: number }> {
    this.verifyCalls++;
    return { matched: this.shouldMatch, confidence: this.shouldMatch ? 0.99 : 0.1 };
  }
}

export class InMemoryBlobStore implements BlobStore {
  private store = new Map<string, Buffer>();

  async put(key: string, data: Buffer): Promise<void> {
    this.store.set(key, data);
  }

  async get(key: string): Promise<Buffer | null> {
    return this.store.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.store.keys()].filter((k) => k.startsWith(prefix));
  }

  async deletePrefix(prefix: string): Promise<void> {
    for (const key of await this.list(prefix)) {
      this.store.delete(key);
    }
  }

  size(): number {
    return this.store.size;
  }

  async signedUrl(key: string): Promise<string> {
    return `memory://${key}`;
  }
}

export class FakeVideo implements VideoAdapter {
  public calls: unknown[] = [];

  async generatePageClip(
    illustrationBlobKey: string,
    narrationText: string,
    options?: { idempotencyKey?: string }
  ): Promise<VideoClipResult> {
    this.calls.push({ illustrationBlobKey, narrationText, options });
    return { videoUrl: "memory://fake-video.mp4", bytes: Buffer.from("fake-video") };
  }
}

export class FakeStripe implements StripeAdapter {
  public sessions: { familyId: string; id: string }[] = [];

  async createCheckoutSession(familyId: string) {
    const session = { id: `cs_${this.sessions.length}`, url: "https://checkout.stripe.com/test" };
    this.sessions.push({ familyId, id: session.id });
    return session;
  }

  async cancelSubscription(_stripeSubscriptionId: string): Promise<void> {}
}

export class FakeWorkflow implements WorkflowAdapter {
  public steps: string[] = [];
  /** When true, drain runs each enqueued job twice to simulate at-least-once delivery. */
  public simulateAtLeastOnceDelivery = false;
  private queue: Array<() => Promise<void>> = [];
  private completedStepKeys = new Set<string>();

  enqueue(_name: string, work: () => Promise<void>): void {
    this.queue.push(work);
  }

  async drain(): Promise<void> {
    const pending = [...this.queue];
    this.queue = [];
    for (const work of pending) {
      await work();
      if (this.simulateAtLeastOnceDelivery) {
        await work();
      }
    }
  }

  async run(steps: WorkflowStep[]): Promise<void> {
    for (const step of steps) {
      const key = step.idempotencyKey ?? step.name;
      if (this.completedStepKeys.has(key)) {
        this.steps.push(`${step.name}:memoized`);
        continue;
      }
      this.steps.push(step.name);
      await step.run();
      this.completedStepKeys.add(key);
    }
  }

  isStepCompleted(idempotencyKey: string): boolean {
    return this.completedStepKeys.has(idempotencyKey);
  }

  private events = new Map<string, unknown>();

  async waitForEvent<T>(eventName: string, matchId: string): Promise<T> {
    const key = `${eventName}:${matchId}`;
    if (!this.events.has(key)) {
      this.events.set(key, {
        status: "ready",
        loraWeightKey: `lora/${matchId}`,
        jobId: matchId,
      });
    }
    return this.events.get(key) as T;
  }

  async emitEvent<T>(eventName: string, data: T & { jobId?: string }): Promise<void> {
    const matchId = (data as { jobId?: string }).jobId ?? eventName;
    this.events.set(`${eventName}:${matchId}`, data);
  }
}

export class FakeNotifications implements NotificationAdapter {
  public emails: { to: string; subject: string }[] = [];
  public pushes: { memberId: string; title: string }[] = [];

  async sendEmail(to: string, subject: string, _body: string): Promise<void> {
    this.emails.push({ to, subject });
  }

  async sendWebPush(memberId: string, title: string, _body: string): Promise<void> {
    this.pushes.push({ memberId, title });
  }
}

export class FakePdf implements PdfAdapter {
  async generateStorybookPdf(storybook: {
    title: string;
    pages: { text: string; illustrationUrl: string }[];
  }): Promise<Buffer> {
    const content = `${storybook.title}\n${storybook.pages.map((p) => p.text).join("\n")}`;
    return Buffer.from(content, "utf-8");
  }
}

export class StubAnthropic implements AnthropicAdapter {
  async generateStory(_input: Parameters<AnthropicAdapter["generateStory"]>[0]): Promise<GeneratedStory> {
    throw new Error("Anthropic adapter not configured");
  }
  async generateTextStory(_input: Parameters<AnthropicAdapter["generateTextStory"]>[0]): Promise<{ text: string }> {
    throw new Error("Anthropic adapter not configured");
  }
  async adaptStory(_input: Parameters<AnthropicAdapter["adaptStory"]>[0]): Promise<GeneratedStory> {
    throw new Error("Anthropic adapter not configured");
  }
  async generateCharacterDescription(
    _questionnaire: Parameters<AnthropicAdapter["generateCharacterDescription"]>[0]
  ): Promise<{ description: string }> {
    throw new Error("Anthropic adapter not configured");
  }
}

export class StubFal implements FalAdapter {
  async startTraining(_photos: Buffer[]): Promise<FalTrainResult> {
    throw new Error("fal.ai adapter not configured");
  }
  async generateImage(
    _prompt: string,
    _loraKey: string,
    _options?: { idempotencyKey?: string }
  ): Promise<FalImageResult> {
    throw new Error("fal.ai adapter not configured");
  }
  async inpaintFaces(): Promise<FalImageResult> {
    throw new Error("fal.ai adapter not configured");
  }
  async generateWithReferenceModel(): Promise<FalImageResult> {
    throw new Error("fal.ai adapter not configured");
  }
}

export class StubModeration implements ModerationAdapter {
  async checkImage(_image: Buffer): Promise<ModerationResult> {
    throw new Error("Moderation adapter not configured");
  }
  async checkText(_text: string): Promise<ModerationResult> {
    throw new Error("Moderation adapter not configured");
  }
}

export class StubLiveness implements LivenessAdapter {
  async verifySelfie(_photos: Buffer[], _selfie: Buffer): Promise<{ matched: boolean; confidence: number }> {
    throw new Error("Liveness adapter not configured");
  }
}
