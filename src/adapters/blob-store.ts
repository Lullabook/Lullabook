import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { BlobStore } from "@/adapters/types";
import { optionalEnv, requireEnv } from "@/adapters/env";

const SIGNED_URL_TTL_SECONDS = 15 * 60;

/**
 * Real encrypted object store on R2/S3 (ADR-0011): photos, LoRA weights, and
 * Page illustrations live here under Family-scoped keys so hard-delete can
 * provably erase them (ADR-0007). Works against Cloudflare R2 (set
 * BLOB_S3_ENDPOINT) or plain S3.
 */
export class R2BlobStore implements BlobStore {
  private client: S3Client | null = null;

  private getClient(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        region: optionalEnv("BLOB_S3_REGION") ?? "auto",
        endpoint: optionalEnv("BLOB_S3_ENDPOINT"),
        credentials: {
          accessKeyId: requireEnv("BLOB_S3_ACCESS_KEY_ID"),
          secretAccessKey: requireEnv("BLOB_S3_SECRET_ACCESS_KEY"),
        },
      });
    }
    return this.client;
  }

  private bucket(): string {
    return requireEnv("BLOB_S3_BUCKET");
  }

  async put(key: string, data: Buffer): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: data,
        // R2 encrypts at rest unconditionally; on plain S3 this header
        // enforces server-side encryption explicitly.
        ...(optionalEnv("BLOB_S3_ENDPOINT") ? {} : { ServerSideEncryption: "AES256" }),
      })
    );
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      const res = await this.getClient().send(
        new GetObjectCommand({ Bucket: this.bucket(), Key: key })
      );
      if (!res.Body) return null;
      return Buffer.from(await res.Body.transformToByteArray());
    } catch (err) {
      if ((err as { name?: string }).name === "NoSuchKey") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({ Bucket: this.bucket(), Key: key })
    );
  }

  async list(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const res = await this.getClient().send(
        new ListObjectsV2Command({
          Bucket: this.bucket(),
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      for (const obj of res.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }

  /** Hard-delete support (ADR-0007): erase every object under a prefix. */
  async deletePrefix(prefix: string): Promise<void> {
    const keys = await this.list(prefix);
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      if (batch.length === 0) continue;
      await this.getClient().send(
        new DeleteObjectsCommand({
          Bucket: this.bucket(),
          Delete: { Objects: batch.map((Key) => ({ Key })) },
        })
      );
    }
  }

  /**
   * Short-lived signed URL for serving a stored illustration to the UI.
   * Pages store blob keys, never provider URLs (PRD v2); this is the
   * resolver that turns a key into something an <img> can load.
   */
  async signedUrl(key: string): Promise<string> {
    return getSignedUrl(
      this.getClient(),
      new GetObjectCommand({ Bucket: this.bucket(), Key: key }),
      { expiresIn: SIGNED_URL_TTL_SECONDS }
    );
  }
}
