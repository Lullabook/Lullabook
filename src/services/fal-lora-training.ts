import { createHash } from "node:crypto";
import type { BlobStore, FalAdapter, FalTrainingRequestRecord, FalTrainingSubmission } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import { LiveFalSpendCapService } from "@/services/live-fal-spend-cap";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";
import { CallbackReachabilityPreflight, CallbackUnreachableError } from "@/services/callback-reachability";
import { resolveCallbackOrigin } from "@/services/callback-origin";

export interface ModeratedTrainingImage {
  filename: string;
  bytes: Buffer;
  moderated: boolean;
  caption?: string;
}

export interface TrainingZipEntry {
  filename: string;
  text: string;
}

export interface FalRoutingDecision {
  endpoint: string;
  model: string;
  steps: number;
}

export interface FalTrainingInput {
  familyId: string;
  personaId: string;
  images: ModeratedTrainingImage[];
  defaultCaption: string;
  idempotencyKey: string;
  routingDecision?: FalRoutingDecision;
}

export interface FalProviderResult {
  requestId: string;
  status: "OK" | "ERROR" | "IN_PROGRESS";
  payload?: {
    diffusers_lora_file?: { url?: string; content_type?: string };
    config_file?: { url?: string; content_type?: string };
  };
  error?: string;
}

export interface DownloadedArtifact {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
}

export type ArtifactDownloader = (url: string) => Promise<DownloadedArtifact>;

export class FalArtifactValidationError extends Error {}

const DEFAULT_ROUTING: FalRoutingDecision = {
  endpoint: "fal-ai/flux-2-trainer-v2",
  model: "flux-2-lora-v2",
  steps: 300,
};

function u16(value: number): Buffer {
  const out = Buffer.alloc(2);
  out.writeUInt16LE(value, 0);
  return out;
}

function u32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value >>> 0, 0);
  return out;
}

// Small dependency-free ZIP writer. Training archives are intentionally stored
// without compression: provider input is already image-heavy and this keeps the
// archive deterministic and easy to audit at the service seam.
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function safeFilename(name: string): string {
  const normalized = name.replaceAll("\\", "/").split("/").pop() ?? "image.jpg";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(normalized) || !/\.(jpe?g|png|webp)$/i.test(normalized)) {
    throw new Error("Training image filename is invalid");
  }
  return normalized;
}

function localFile(filename: string, data: Buffer): Buffer {
  const name = Buffer.from(filename);
  return Buffer.concat([
    Buffer.from("PK\x03\x04", "binary"),
    u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc32(data)),
    u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
  ]);
}

function centralFile(filename: string, data: Buffer, offset: number): Buffer {
  const name = Buffer.from(filename);
  return Buffer.concat([
    Buffer.from("PK\x01\x02", "binary"),
    u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc32(data)),
    u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0),
    u16(0), u32(0), u32(offset), name,
  ]);
}

export function buildTrainingZip(images: ModeratedTrainingImage[], defaultCaption: string): Buffer {
  const fallback = defaultCaption.trim();
  if (!fallback) throw new Error("A non-empty default caption is required");
  const entries: { filename: string; data: Buffer }[] = [];
  for (const image of images) {
    if (!image.moderated) continue;
    const filename = safeFilename(image.filename);
    const caption = image.caption?.trim() || fallback;
    if (!caption) throw new Error(`Caption missing for ${filename}`);
    entries.push({ filename, data: image.bytes });
    entries.push({ filename: filename.replace(/\.[^.]+$/, ".txt"), data: Buffer.from(caption, "utf8") });
  }
  if (entries.length === 0) throw new Error("At least one moderated training image is required");
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localFile(entry.filename, entry.data);
    locals.push(local);
    centrals.push(centralFile(entry.filename, entry.data, offset));
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  return Buffer.concat([...locals, central, Buffer.from("PK\x05\x06\0\0\0\0", "binary"), u16(entries.length), u16(entries.length), u32(central.length), u32(offset), u16(0)]);
}

/** Minimal reader used by contract tests and operational archive inspection. */
export function inspectTrainingZip(zip: Buffer): TrainingZipEntry[] {
  const result: TrainingZipEntry[] = [];
  let offset = 0;
  while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
    const nameLength = zip.readUInt16LE(offset + 26);
    const extraLength = zip.readUInt16LE(offset + 28);
    const size = zip.readUInt32LE(offset + 18);
    const name = zip.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extraLength;
    result.push({ filename: name, text: zip.subarray(start, start + size).toString() });
    offset = start + size;
  }
  return result;
}

function trustedFalArtifactUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new FalArtifactValidationError("Provider artifact URL is invalid");
  }
  const trustedHost = url.hostname === "fal.media" || url.hostname.endsWith(".fal.media");
  if (url.protocol !== "https:" || !trustedHost || url.username || url.password) {
    throw new FalArtifactValidationError("Provider artifact URL is not a trusted fal origin");
  }
  return url;
}

function artifactName(url: string, expectedExtension: string): string {
  const value = trustedFalArtifactUrl(url).pathname.split("/").pop() ?? "";
  if (!/^[a-zA-Z0-9._-]+$/.test(value) || !value.toLowerCase().endsWith(expectedExtension)) {
    throw new FalArtifactValidationError(`Provider artifact is not a ${expectedExtension} file`);
  }
  return value;
}

function normalizedContentType(value: string | undefined): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function validateSafetensors(bytes: Buffer): void {
  if (bytes.length < 10) throw new FalArtifactValidationError("LoRA artifact is empty or truncated");
  const headerLength = Number(bytes.readBigUInt64LE(0));
  if (!Number.isSafeInteger(headerLength) || headerLength < 2 || headerLength > bytes.length - 8) {
    throw new FalArtifactValidationError("LoRA artifact has an invalid safetensors header");
  }
  try {
    const header = JSON.parse(bytes.subarray(8, 8 + headerLength).toString("utf8"));
    if (!header || typeof header !== "object" || Array.isArray(header)) throw new Error("invalid");
  } catch {
    throw new FalArtifactValidationError("LoRA artifact has an invalid safetensors header");
  }
}

function validateConfig(bytes: Buffer, expectedModel: string): void {
  if (bytes.length === 0) throw new FalArtifactValidationError("LoRA configuration is empty");
  try {
    const config = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("invalid");
    const identity = config.model ?? config.architecture;
    if (typeof identity === "string" && identity !== expectedModel) {
      throw new FalArtifactValidationError("LoRA configuration model does not match the selected model");
    }
  } catch (error) {
    if (error instanceof FalArtifactValidationError) throw error;
    throw new FalArtifactValidationError("LoRA configuration is not valid JSON");
  }
}

export function createFalArtifactDownloader(fetchImpl: typeof fetch = fetch): ArtifactDownloader {
  return async (value: string) => {
    let current = trustedFalArtifactUrl(value);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(current, { redirect: "manual" });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirects === 3) throw new FalArtifactValidationError("Provider artifact redirect is invalid");
        current = trustedFalArtifactUrl(new URL(location, current).toString());
        continue;
      }
      if (!response.ok) throw new Error(`Failed to fetch fal artifact (${response.status})`);
      return {
        bytes: Buffer.from(await response.arrayBuffer()),
        contentType: normalizedContentType(response.headers.get("content-type") ?? undefined),
        finalUrl: current.toString(),
      };
    }
    throw new FalArtifactValidationError("Provider artifact redirect limit exceeded");
  };
}

export async function copyValidatedTrainingArtifacts(
  request: FalTrainingRequestRecord,
  result: FalProviderResult,
  blobs: BlobStore,
  download: ArtifactDownloader,
): Promise<{ loraWeightKey: string; configurationKey: string }> {
  const weight = result.payload?.diffusers_lora_file;
  const config = result.payload?.config_file;
  if (!weight?.url || !config?.url) {
    throw new FalArtifactValidationError("Training result must include LoRA and configuration artifacts");
  }
  artifactName(weight.url, ".safetensors");
  artifactName(config.url, ".json");
  const weightDeclaredType = normalizedContentType(weight.content_type);
  const configDeclaredType = normalizedContentType(config.content_type);
  if (!["application/octet-stream", "binary/octet-stream", "application/safetensors"].includes(weightDeclaredType)) {
    throw new FalArtifactValidationError("LoRA artifact content type is invalid");
  }
  if (configDeclaredType !== "application/json") {
    throw new FalArtifactValidationError("LoRA configuration content type is invalid");
  }

  const [downloadedWeight, downloadedConfig] = await Promise.all([
    download(weight.url),
    download(config.url),
  ]);
  artifactName(downloadedWeight.finalUrl, ".safetensors");
  artifactName(downloadedConfig.finalUrl, ".json");
  if (!["application/octet-stream", "binary/octet-stream", "application/safetensors"].includes(normalizedContentType(downloadedWeight.contentType))) {
    throw new FalArtifactValidationError("Downloaded LoRA artifact content type is invalid");
  }
  if (normalizedContentType(downloadedConfig.contentType) !== "application/json") {
    throw new FalArtifactValidationError("Downloaded LoRA configuration content type is invalid");
  }
  validateSafetensors(downloadedWeight.bytes);
  validateConfig(downloadedConfig.bytes, request.model);

  const loraWeightKey = `lora/${request.familyId}/${request.personaId}/weights.safetensors`;
  const configurationKey = `lora/${request.familyId}/${request.personaId}/config.json`;
  try {
    await blobs.put(loraWeightKey, downloadedWeight.bytes);
    await blobs.put(configurationKey, downloadedConfig.bytes);
  } catch (error) {
    await Promise.allSettled([blobs.delete(loraWeightKey), blobs.delete(configurationKey)]);
    throw error;
  }
  return { loraWeightKey, configurationKey };
}

export function redactProviderError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/gi, "$1[REDACTED]")
    .replace(/(secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

export class FalLoraTrainingService {
  constructor(
    private readonly store: DataStore,
    private readonly fal: FalAdapter | undefined,
    private readonly blobs: BlobStore,
    private readonly routing: FalRoutingDecision = DEFAULT_ROUTING,
    private readonly now: () => Date = () => new Date(),
    private readonly costMeter: ProviderCostMeteringService = new ProviderCostMeteringService(store),
    private readonly liveFalCap: LiveFalSpendCapService = new LiveFalSpendCapService(store),
    private readonly preflight: CallbackReachabilityPreflight = new CallbackReachabilityPreflight(),
  ) {}

  async submit(input: FalTrainingInput): Promise<{ requestId: string; status: "queued" }> {
    const prior = [...this.store.falTrainingRequests.values()].find((request) => request.idempotencyKey === input.idempotencyKey);
    if (prior) return { requestId: prior.requestId, status: "queued" };
    const routing = input.routingDecision ?? this.routing;
    if (!routing.endpoint || !routing.model || !Number.isInteger(routing.steps) || routing.steps < 100) throw new Error("Invalid canary routing decision");
    // Issue 203 / FAIL-6 — reachability preflight on the configured public
    // callback origin, BEFORE any fal.ai request and BEFORE any spend is
    // reserved. A training whose callback can never arrive must fail closed
    // without reserving budget.
    //
    // Enforcement point: only a real (non dev-only) provider is a live boundary,
    // so the live determination is hoisted above the preflight. On that live
    // path the callback origin is strictly resolved from configuration BEFORE
    // the probe — resolveCallbackOrigin() throws CallbackOriginConfigError (which
    // names NEXT_PUBLIC_APP_URL) when the origin is missing or malformed — so a
    // live deployment with no configured origin cannot reserve spend or call fal
    // with no way to deliver the callback. The dev-only path keeps the lenient
    // behaviour below (no probe when the origin is unset).
    const liveProvider = this.canSatisfyReleaseEvidence();
    if (liveProvider && !this.preflight.configuredOrigin()) {
      resolveCallbackOrigin();
    }
    const reachable = await this.preflight.check();
    if (!reachable.ok) {
      throw new CallbackUnreachableError(reachable.error ?? this.preflight.callbackUrl());
    }
    const zip = buildTrainingZip(input.images, input.defaultCaption);
    const zipKey = `training-inputs/${input.familyId}/${input.personaId}/${createHash("sha256").update(zip).digest("hex")}.zip`;
    await this.blobs.put(zipKey, zip);
    const imageDataUrl = await this.blobs.signedUrl(zipKey);
    const submission: FalTrainingSubmission = {
      imageDataUrl,
      defaultCaption: input.defaultCaption.trim(),
      endpoint: routing.endpoint,
      model: routing.model,
      steps: routing.steps,
      idempotencyKey: input.idempotencyKey,
    };
    const startedAt = Date.now();
    // Only a real (non dev-only) provider is a billable boundary and therefore
    // must pass the $20 live-fal cap + LIVE opt-in (issue 204). A live run with
    // no cap service is a misconfiguration — fail closed rather than spend
    // unbudgeted.
    let reservation: { estimatedCostUsd: number; pricingVersion: string } | null = null;
    if (liveProvider) {
      // Reserve the exact route estimate and flush it to durable storage before
      // the provider await, so a crash mid-call still holds the spend against
      // the ceiling. settle() then moves the hold to succeeded (keep) or
      // failed (release). A failed flush aborts before the boundary.
      reservation = this.liveFalCap.reserve({
        familyId: input.familyId,
        personaId: input.personaId,
        provider: "fal.ai",
        endpoint: routing.endpoint,
        model: routing.model,
        units: { training_steps: routing.steps },
        idempotencyKey: input.idempotencyKey,
      });
      await this.store.persistProviderSpendState();
    }
    // Kill switches + margin authorization gate both live and dev boundaries.
    this.costMeter.assertSpendAllowed({
      familyId: input.familyId,
      provider: "fal.ai",
      model: routing.model,
      endpoint: routing.endpoint,
    });
    let result: Awaited<ReturnType<FalAdapter["submitTraining"]>>;
    try {
      result = await this.fal!.submitTraining(submission);
    } catch (error) {
      if (liveProvider && reservation) {
        this.liveFalCap.settle({
          familyId: input.familyId,
          idempotencyKey: input.idempotencyKey,
          outcome: "failed",
          latencyMs: Math.max(0, Date.now() - startedAt),
        });
      } else {
        this.costMeter.recordAttempt({
          provider: "fal.ai",
          endpoint: routing.endpoint,
          model: routing.model,
          pricingVersion: reservation?.pricingVersion ?? "r1-training-v1",
          units: { training_steps: routing.steps },
          estimatedCostUsd: reservation?.estimatedCostUsd ?? 0,
          latencyMs: Math.max(0, Date.now() - startedAt),
          requestId: input.idempotencyKey,
          owningEntityIds: { familyId: input.familyId, personaId: input.personaId },
          attemptType: "training",
          outcome: "failed",
        });
      }
      throw error;
    }
    if (liveProvider && reservation) {
      this.liveFalCap.settle({
        familyId: input.familyId,
        idempotencyKey: input.idempotencyKey,
        outcome: "succeeded",
        providerRequestId: result.jobId,
        latencyMs: Math.max(0, Date.now() - startedAt),
      });
    } else {
      this.costMeter.recordAttempt({
        provider: "fal.ai",
        endpoint: routing.endpoint,
        model: routing.model,
        pricingVersion: reservation?.pricingVersion ?? "r1-training-v1",
        units: { training_steps: routing.steps },
        estimatedCostUsd: reservation?.estimatedCostUsd ?? 0,
        latencyMs: Math.max(0, Date.now() - startedAt),
        requestId: result.jobId,
        owningEntityIds: { familyId: input.familyId, personaId: input.personaId },
        attemptType: "training",
        outcome: "succeeded",
      });
    }
    const timestamp = this.now();
    const record: FalTrainingRequestRecord = {
      requestId: result.jobId,
      familyId: input.familyId,
      personaId: input.personaId,
      endpoint: routing.endpoint,
      model: routing.model,
      steps: routing.steps,
      idempotencyKey: input.idempotencyKey,
      status: "queued",
      inputZipKey: zipKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.falTrainingRequests.set(result.jobId, record);
    return { requestId: result.jobId, status: "queued" };
  }

  async handleResult(
    result: FalProviderResult,
    download?: (url: string) => Promise<DownloadedArtifact | Buffer>,
  ): Promise<void> {
    const request = this.store.falTrainingRequests.get(result.requestId);
    if (!request) throw new Error("Unknown fal training request");
    if (request.status === "ready" || request.status === "failed") return;
    if (result.status === "IN_PROGRESS") {
      request.status = "running";
      request.updatedAt = this.now();
      return;
    }
    if (result.status === "ERROR") {
      request.status = "failed";
      request.error = redactProviderError(result.error ?? "fal training failed");
      request.updatedAt = this.now();
      return;
    }
    if (!download) throw new Error("Training result must include an artifact downloader");
    const normalizedDownload: ArtifactDownloader = async (url) => {
      const artifact = await download(url);
      if (!Buffer.isBuffer(artifact)) return artifact;
      const declared = url === result.payload?.config_file?.url
        ? result.payload?.config_file?.content_type
        : result.payload?.diffusers_lora_file?.content_type;
      return { bytes: artifact, contentType: declared ?? "", finalUrl: url };
    };
    const owned = await copyValidatedTrainingArtifacts(request, result, this.blobs, normalizedDownload);
    request.loraWeightKey = owned.loraWeightKey;
    request.configurationKey = owned.configurationKey;
    request.status = "ready";
    request.updatedAt = this.now();
  }

  canSatisfyReleaseEvidence(): boolean { return this.fal?.isDevOnly !== true; }

  toClientStatus(requestId: string): { requestId: string; status: string; error?: string } {
    const request = this.store.falTrainingRequests.get(requestId);
    if (!request) throw new Error("Training request not found");
    return { requestId, status: request.status, ...(request.error ? { error: request.error } : {}) };
  }
}
