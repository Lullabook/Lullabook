import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { R2BlobStore } from "@/adapters/blob-store";
import { LocalDiskBlobStore } from "@/adapters/local-blob-store";
import { createBlobStore } from "@/lib/create-blob-store";

describe("57 — local blob-store dev fallback", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lullablob-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  describe("LocalDiskBlobStore", () => {
    it("put/get round-trips bytes", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      const data = Buffer.from("photo-bytes");
      await store.put("photos/p1/0.jpg", data);
      expect(await store.get("photos/p1/0.jpg")).toEqual(data);
    });

    it("get returns null for missing keys", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      expect(await store.get("missing/key")).toBeNull();
    });

    it("delete removes a key", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      await store.put("k", Buffer.from("x"));
      await store.delete("k");
      expect(await store.get("k")).toBeNull();
    });

    it("list returns keys under prefix", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      await store.put("photos/a/0.jpg", Buffer.from("a"));
      await store.put("photos/a/1.jpg", Buffer.from("b"));
      await store.put("photos/b/0.jpg", Buffer.from("c"));
      expect(await store.list("photos/a")).toEqual(["photos/a/0.jpg", "photos/a/1.jpg"]);
    });

    it("deletePrefix removes all keys under prefix", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      await store.put("families/f1/photo.jpg", Buffer.from("x"));
      await store.put("families/f1/other.jpg", Buffer.from("y"));
      await store.put("families/f2/photo.jpg", Buffer.from("z"));
      await store.deletePrefix("families/f1/");
      expect(await store.list("families/f1")).toEqual([]);
      expect(await store.get("families/f2/photo.jpg")).not.toBeNull();
    });

    it("persists across store instances (disk-backed)", async () => {
      const store1 = new LocalDiskBlobStore(tempDir);
      await store1.put("persist/key", Buffer.from("survives"));
      const store2 = new LocalDiskBlobStore(tempDir);
      expect(await store2.get("persist/key")).toEqual(Buffer.from("survives"));
    });

    it("signedUrl returns a local-blob API path", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      const url = await store.signedUrl("photos/p1/0.jpg");
      expect(url).toBe("/api/local-blob?key=photos%2Fp1%2F0.jpg");
    });

    it("rejects path traversal in keys", async () => {
      const store = new LocalDiskBlobStore(tempDir);
      await expect(store.put("../escape", Buffer.from("x"))).rejects.toThrow("Invalid blob key");
    });
  });

  describe("createBlobStore selection", () => {
    it("returns local disk when no S3 creds and non-production", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BLOB_S3_ACCESS_KEY_ID", "");
      const store = createBlobStore({ rootDir: tempDir });
      expect(store).toBeInstanceOf(LocalDiskBlobStore);
    });

    it("returns R2 when BLOB_S3_ACCESS_KEY_ID is set", () => {
      vi.stubEnv("BLOB_S3_ACCESS_KEY_ID", "test-key");
      vi.stubEnv("NODE_ENV", "development");
      const store = createBlobStore();
      expect(store).toBeInstanceOf(R2BlobStore);
    });

    it("returns R2 in production even without explicit creds", () => {
      vi.stubEnv("BLOB_S3_ACCESS_KEY_ID", "");
      vi.stubEnv("NODE_ENV", "production");
      const store = createBlobStore();
      expect(store).toBeInstanceOf(R2BlobStore);
    });
  });
});
