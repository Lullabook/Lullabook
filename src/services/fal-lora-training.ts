import { createHash } from "node:crypto";
import type { BlobStore, FalAdapter, FalTrainingRequestRecord, FalTrainingSubmission } from "@/adapters/types";
import type { DataStore } from "@/db/store";

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

function basename(url: string, fallback: string): string {
  let value: string;
  try { value = new URL(url).pathname.split("/").pop() || fallback; } catch { throw new Error("Provider artifact URL is invalid"); }
  if (!/^[a-zA-Z0-9._-]+$/.test(value) || value === "." || value === "..") throw new Error("Provider artifact filename is invalid");
  return value;
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
  ) {}

  async submit(input: FalTrainingInput): Promise<{ requestId: string; status: "queued" }> {
    const prior = [...this.store.falTrainingRequests.values()].find((request) => request.idempotencyKey === input.idempotencyKey);
    if (prior) return { requestId: prior.requestId, status: "queued" };
    const routing = input.routingDecision ?? this.routing;
    if (!routing.endpoint || !routing.model || !Number.isInteger(routing.steps) || routing.steps < 100) throw new Error("Invalid canary routing decision");
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
    const result = await this.fal!.submitTraining(submission);
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

  async handleResult(result: FalProviderResult, download?: (url: string) => Promise<Buffer>): Promise<void> {
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
    const weightUrl = result.payload?.diffusers_lora_file?.url;
    const configUrl = result.payload?.config_file?.url;
    if (!weightUrl || !configUrl || !download) throw new Error("Training result must include diffusers_lora_file and config_file");
    const weightName = basename(weightUrl, "weights.safetensors");
    const configName = basename(configUrl, "config.json");
    const weightKey = `lora/${request.familyId}/${request.personaId}/${weightName}`;
    const configKey = `lora/${request.familyId}/${request.personaId}/${configName}`;
    await this.blobs.put(weightKey, await download(weightUrl));
    await this.blobs.put(configKey, await download(configUrl));
    request.loraWeightKey = weightKey;
    request.configurationKey = configKey;
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
