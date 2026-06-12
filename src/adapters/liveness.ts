import {
  CompareFacesCommand,
  RekognitionClient,
} from "@aws-sdk/client-rekognition";
import type { LivenessAdapter, LivenessResult } from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

// DECISION: AWS Rekognition CompareFaces for the Adult Persona selfie/face
// match (ADR-0014) — the AWS SDK is already a dependency for S3, and
// CompareFaces is the lowest-integration-cost face-match API. A dedicated
// liveness vendor (active liveness challenges) can replace this behind the
// same port later.
const MATCH_THRESHOLD = 90;

export class RekognitionLivenessAdapter implements LivenessAdapter {
  private client: RekognitionClient | null = null;

  private getClient(): RekognitionClient {
    if (!this.client) {
      this.client = new RekognitionClient({
        region: optionalEnv("AWS_REKOGNITION_REGION") ?? "us-east-1",
        credentials: {
          accessKeyId: requireEnv("AWS_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("AWS_SECRET_ACCESS_KEY"),
        },
      });
    }
    return this.client;
  }

  /**
   * The selfie must match the person in the uploaded reference photos —
   * "creator's own likeness only" (ADR-0014). Every photo is compared; the
   * weakest match decides, so a stranger's photo slipped into the set fails.
   */
  async verifySelfie(photos: Buffer[], selfie: Buffer): Promise<LivenessResult> {
    let weakest = 100;
    for (const photo of photos) {
      const res = await this.getClient().send(
        new CompareFacesCommand({
          SourceImage: { Bytes: new Uint8Array(selfie) },
          TargetImage: { Bytes: new Uint8Array(photo) },
          SimilarityThreshold: 0,
        })
      );
      const best = (res.FaceMatches ?? [])
        .map((m) => m.Similarity ?? 0)
        .sort((a, b) => b - a)[0];
      if (best === undefined) {
        return { matched: false, confidence: 0 };
      }
      weakest = Math.min(weakest, best);
    }
    return { matched: weakest >= MATCH_THRESHOLD, confidence: weakest / 100 };
  }
}
