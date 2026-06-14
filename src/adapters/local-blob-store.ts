import { mkdir, readFile, readdir, rm, stat, writeFile } from "fs/promises";
import { join, relative, resolve } from "path";
import type { BlobStore } from "@/adapters/types";

const DEFAULT_ROOT = join(process.cwd(), ".localblob");

function assertSafeKey(key: string): void {
  if (!key || key.includes("..") || key.startsWith("/") || key.includes("\\")) {
    throw new Error(`Invalid blob key: ${key}`);
  }
}

function keyToPath(rootDir: string, key: string): string {
  assertSafeKey(key);
  const filePath = resolve(rootDir, key);
  const rel = relative(rootDir, filePath);
  if (rel.startsWith("..") || rel.includes("..")) {
    throw new Error(`Invalid blob key: ${key}`);
  }
  return filePath;
}

async function walkKeys(rootDir: string, prefix: string): Promise<string[]> {
  const dir = keyToPath(rootDir, prefix.endsWith("/") ? prefix.slice(0, -1) : prefix);
  let dirStat;
  try {
    dirStat = await stat(dir);
  } catch {
    return [];
  }
  if (!dirStat.isDirectory()) {
    return prefix ? [prefix] : [];
  }

  const keys: string[] = [];
  async function walk(currentDir: string, currentPrefix: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);
      const entryKey = currentPrefix ? `${currentPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(entryPath, entryKey);
      } else if (entry.isFile()) {
        keys.push(entryKey);
      }
    }
  }
  await walk(dir, prefix.replace(/\/$/, ""));
  return keys.sort();
}

/**
 * Disk-backed blob store for local dev when R2/S3 creds are absent (issue 57).
 * Objects persist under `.localblob/` so uploads survive dev-server restarts.
 */
export class LocalDiskBlobStore implements BlobStore {
  constructor(private readonly rootDir: string = DEFAULT_ROOT) {}

  async put(key: string, data: Buffer): Promise<void> {
    const filePath = keyToPath(this.rootDir, key);
    await mkdir(join(filePath, ".."), { recursive: true });
    await writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer | null> {
    const filePath = keyToPath(this.rootDir, key);
    try {
      return await readFile(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = keyToPath(this.rootDir, key);
    try {
      await rm(filePath, { force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async list(prefix: string): Promise<string[]> {
    return walkKeys(this.rootDir, prefix);
  }

  async deletePrefix(prefix: string): Promise<void> {
    const keys = await this.list(prefix);
    for (const key of keys) {
      await this.delete(key);
    }
  }

  async signedUrl(key: string): Promise<string> {
    assertSafeKey(key);
    return `/api/local-blob?key=${encodeURIComponent(key)}`;
  }
}
