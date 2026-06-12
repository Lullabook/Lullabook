import { createHash } from "node:crypto";
import type { ModerationAdapter, ModerationResult } from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

// DECISION: Sightengine for the image/text safety classifiers (simple REST,
// no SDK), plus a dedicated CSAM hash-match endpoint (PhotoDNA-compatible
// service behind CSAM_HASH_API_URL — access requires NCMEC clearance and is
// tracked as an external launch blocker). ADR-0010 layer ordering: the CSAM
// hash-match runs FIRST, and a positive is reported as csamDetected so the
// ChildSafetyService escalates to the HITL/NCMEC path — never a silent
// quarantine.
const SIGHTENGINE_IMAGE_URL = "https://api.sightengine.com/1.0/check.json";
const SIGHTENGINE_TEXT_URL = "https://api.sightengine.com/1.0/text/check.json";

interface SightengineImageResponse {
  status: string;
  nudity?: { sexual_activity: number; sexual_display: number; erotica: number; suggestive: number };
  offensive?: { prob: number };
  gore?: { prob: number };
  weapon?: { classes?: Record<string, number> };
}

interface SightengineTextResponse {
  status: string;
  profanity?: { matches: unknown[] };
  personal?: { matches: unknown[] };
  moderation_classes?: Record<string, number | string>;
}

const IMAGE_BLOCK_THRESHOLD = 0.5;

export class RealModerationAdapter implements ModerationAdapter {
  async checkImage(image: Buffer): Promise<ModerationResult> {
    // Layer 1 — known-CSAM hash match, before any classifier verdict can
    // soften the outcome.
    const csam = await this.csamHashMatch(image);
    if (csam) {
      return { allowed: false, reason: "CSAM hash match", csamDetected: true };
    }

    // Layer 2 — safety classifier on the raw bytes.
    const form = new FormData();
    form.append("media", new Blob([new Uint8Array(image)]), "image.png");
    form.append("models", "nudity-2.1,offensive-2.0,gore-2.0");
    form.append("api_user", requireEnv("SIGHTENGINE_API_USER"));
    form.append("api_secret", requireEnv("SIGHTENGINE_API_SECRET"));

    const res = await fetch(SIGHTENGINE_IMAGE_URL, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`Image moderation request failed (${res.status})`);
    }
    const data = (await res.json()) as SightengineImageResponse;
    if (data.status !== "success") {
      throw new Error("Image moderation returned an error status");
    }

    const scores: Record<string, number> = {
      "sexual content": Math.max(
        data.nudity?.sexual_activity ?? 0,
        data.nudity?.sexual_display ?? 0,
        data.nudity?.erotica ?? 0,
        data.nudity?.suggestive ?? 0
      ),
      "offensive content": data.offensive?.prob ?? 0,
      gore: data.gore?.prob ?? 0,
    };
    for (const [label, score] of Object.entries(scores)) {
      if (score >= IMAGE_BLOCK_THRESHOLD) {
        return { allowed: false, reason: `unsafe image: ${label}` };
      }
    }
    return { allowed: true };
  }

  async checkText(text: string): Promise<ModerationResult> {
    const params = new URLSearchParams({
      text,
      mode: "ml",
      lang: "en",
      models: "general",
      api_user: requireEnv("SIGHTENGINE_API_USER"),
      api_secret: requireEnv("SIGHTENGINE_API_SECRET"),
    });
    const res = await fetch(SIGHTENGINE_TEXT_URL, { method: "POST", body: params });
    if (!res.ok) {
      throw new Error(`Text moderation request failed (${res.status})`);
    }
    const data = (await res.json()) as SightengineTextResponse;
    if (data.status !== "success") {
      throw new Error("Text moderation returned an error status");
    }

    const classes = data.moderation_classes ?? {};
    for (const [label, raw] of Object.entries(classes)) {
      if (label === "available") continue;
      const score = typeof raw === "number" ? raw : 0;
      if (score >= IMAGE_BLOCK_THRESHOLD) {
        return { allowed: false, reason: `unsafe text: ${label}` };
      }
    }
    return { allowed: true };
  }

  /**
   * Known-CSAM hash match. Posts a perceptual-hash-friendly payload to the
   * configured matching service. When the service is not yet provisioned
   * (env unset), this layer is skipped — the classifier layer still runs,
   * and provisioning the hash service remains a launch gate (ADR-0010).
   */
  private async csamHashMatch(image: Buffer): Promise<boolean> {
    const url = optionalEnv("CSAM_HASH_API_URL");
    const key = optionalEnv("CSAM_HASH_API_KEY");
    if (!url || !key) return false;

    const sha256 = createHash("sha256").update(image).digest("hex");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ sha256, imageBase64: image.toString("base64") }),
    });
    if (!res.ok) {
      // A hash-service outage must fail closed for uploads of minors' photos:
      // surfacing an error (rather than allowing) keeps the bytes unpersisted.
      throw new Error(`CSAM hash-match service failed (${res.status})`);
    }
    const data = (await res.json()) as { match: boolean };
    return data.match === true;
  }
}
