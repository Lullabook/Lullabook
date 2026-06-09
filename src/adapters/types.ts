import type { GeneratedStory } from "@/domain/types";

export interface AnthropicAdapter {
  generateStory(input: {
    brief: string;
    personaNames: string[];
    pageCount: number;
  }): Promise<GeneratedStory>;
}

export interface FalTrainResult {
  jobId: string;
  status: "queued";
}

export interface FalTrainWebhook {
  jobId: string;
  status: "ready" | "failed";
  loraWeightKey?: string;
  sampleImageUrls?: string[];
}

export interface FalImageResult {
  imageUrl: string;
}

export interface FalAdapter {
  startTraining(photos: Buffer[]): Promise<FalTrainResult>;
  generateImage(prompt: string, loraKey: string): Promise<FalImageResult>;
  inpaintFaces(
    baseImageUrl: string,
    faces: { region: string; loraKey: string }[]
  ): Promise<FalImageResult>;
  generateWithReferenceModel(
    prompt: string,
    referenceImageUrls: string[]
  ): Promise<FalImageResult>;
}

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  csamDetected?: boolean;
}

export interface ModerationAdapter {
  checkImage(image: Buffer): Promise<ModerationResult>;
  checkText(text: string): Promise<ModerationResult>;
}

export interface LivenessResult {
  matched: boolean;
  confidence: number;
}

export interface LivenessAdapter {
  verifySelfie(photos: Buffer[], selfie: Buffer): Promise<LivenessResult>;
}

export interface BlobStore {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  deletePrefix(prefix: string): Promise<void>;
}

export interface StripeCheckoutSession {
  id: string;
  url: string;
}

export interface StripeAdapter {
  createCheckoutSession(familyId: string): Promise<StripeCheckoutSession>;
  cancelSubscription(stripeSubscriptionId: string): Promise<void>;
}

export interface WorkflowStep {
  name: string;
  run: () => Promise<void>;
}

export interface WorkflowAdapter {
  run(steps: WorkflowStep[]): Promise<void>;
  waitForEvent<T>(eventName: string, matchId: string): Promise<T>;
  emitEvent<T>(eventName: string, data: T): Promise<void>;
}

export interface NotificationAdapter {
  sendEmail(to: string, subject: string, body: string): Promise<void>;
  sendWebPush(memberId: string, title: string, body: string): Promise<void>;
}

export interface PdfAdapter {
  generateStorybookPdf(storybook: {
    title: string;
    pages: { text: string; illustrationUrl: string }[];
  }): Promise<Buffer>;
}
