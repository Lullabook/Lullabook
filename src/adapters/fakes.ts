import type {
  AnthropicAdapter,
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
  WorkflowAdapter,
  WorkflowStep,
} from "@/adapters/types";
import type { GeneratedStory } from "@/domain/types";

export class FakeAnthropic implements AnthropicAdapter {
  public calls: unknown[] = [];
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
    pageCount: number;
  }): Promise<GeneratedStory> {
    this.calls.push(input);
    return this.response;
  }
}

export class FakeFal implements FalAdapter {
  public trainCalls = 0;
  public imageCalls = 0;
  public failImageOnPage: number | null = null;
  public currentPage = 0;
  private jobs = new Map<string, FalTrainWebhook>();

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

  async generateImage(prompt: string, loraKey: string): Promise<FalImageResult> {
    this.imageCalls++;
    this.currentPage++;
    if (this.failImageOnPage === this.currentPage) {
      throw new Error("Image generation failed");
    }
    return { imageUrl: `https://example.com/${loraKey}/${this.currentPage}.png` };
  }

  async inpaintFaces(
    baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult> {
    return {
      imageUrl: `https://example.com/inpaint/${faces.length}.png`,
    };
  }

  async generateWithReferenceModel(
    prompt: string,
    referenceImageUrls: string[]
  ): Promise<FalImageResult> {
    return {
      imageUrl: `https://example.com/ref/${referenceImageUrls.length}.png`,
    };
  }
}

export class FakeModeration implements ModerationAdapter {
  public blockedTexts: string[] = [];
  public blockedImages: number[] = [];
  public audit: ModerationResult[] = [];

  async checkImage(image: Buffer): Promise<ModerationResult> {
    const hash = image.length;
    if (this.blockedImages.includes(hash)) {
      const result = { allowed: false, reason: "unsafe image", csamDetected: true };
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

  async verifySelfie(
    _photos: Buffer[],
    _selfie: Buffer
  ): Promise<{ matched: boolean; confidence: number }> {
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

  async run(steps: WorkflowStep[]): Promise<void> {
    for (const step of steps) {
      this.steps.push(step.name);
      await step.run();
    }
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
  async generateStory(): Promise<GeneratedStory> {
    throw new Error("Anthropic adapter not configured");
  }
}

export class StubFal implements FalAdapter {
  async startTraining(): Promise<FalTrainResult> {
    throw new Error("fal.ai adapter not configured");
  }
  async generateImage(): Promise<FalImageResult> {
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
  async checkImage(): Promise<ModerationResult> {
    throw new Error("Moderation adapter not configured");
  }
  async checkText(): Promise<ModerationResult> {
    throw new Error("Moderation adapter not configured");
  }
}

export class StubLiveness implements LivenessAdapter {
  async verifySelfie(): Promise<{ matched: boolean; confidence: number }> {
    throw new Error("Liveness adapter not configured");
  }
}
