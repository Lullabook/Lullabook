import { R2BlobStore } from "@/adapters/blob-store";
import { LocalDiskBlobStore } from "@/adapters/local-blob-store";
import { optionalEnv } from "@/adapters/env";
import type { BlobStore } from "@/adapters/types";

/**
 * Composition-root helper (issue 57): real R2 in production or when creds are
 * present; disk-backed `.localblob/` otherwise so local dev can store photos.
 */
export function createBlobStore(options?: { rootDir?: string }): BlobStore {
  if (optionalEnv("BLOB_S3_ACCESS_KEY_ID") || process.env.NODE_ENV === "production") {
    return new R2BlobStore();
  }
  return new LocalDiskBlobStore(options?.rootDir);
}
