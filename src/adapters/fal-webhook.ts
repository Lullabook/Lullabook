import { createHash, createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";

export interface FalWebhookHeaders {
  requestId: string;
  userId: string;
  timestamp: string;
  signature: string;
}

export type FalWebhookPublicKey = KeyObject | JsonWebKey | string;

export interface FalWebhookVerifierOptions {
  now?: () => number;
  maxAgeSeconds?: number;
  resolvePublicKeys: () => Promise<FalWebhookPublicKey[]>;
  onBodyHash?: () => void;
}

export function encodeFalWebhookSignature(signature: Buffer): string {
  return `v1,${signature.toString("base64")}`;
}

function decodeSignature(value: string): Buffer {
  const encoded = value.includes(",") ? value.split(",").pop()! : value;
  return Buffer.from(encoded.replaceAll("-", "+").replaceAll("_", "/"), "base64");
}

function asPublicKey(key: FalWebhookPublicKey): KeyObject {
  if (typeof key === "string") return createPublicKey(key);
  if (key instanceof Object && "type" in key) return key as KeyObject;
  return createPublicKey({ key: key as unknown as { kty: string; [name: string]: unknown }, format: "jwk" });
}

export function createFalWebhookVerifier(options: FalWebhookVerifierOptions) {
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const maxAge = options.maxAgeSeconds ?? 300;
  return {
    async verify(headers: FalWebhookHeaders, rawBody: string): Promise<void> {
      if (!headers.requestId || !headers.userId || !headers.timestamp || !headers.signature) throw new Error("Missing fal webhook signature headers");
      const timestamp = Number(headers.timestamp);
      if (!Number.isInteger(timestamp) || Math.abs(now() - timestamp) > maxAge) throw new Error("Stale fal webhook timestamp");
      const bodyHash = createHash("sha256").update(rawBody).digest("hex");
      options.onBodyHash?.();
      const message = `${headers.requestId}\n${headers.userId}\n${headers.timestamp}\n${bodyHash}`;
      // Structural parseability is checked after hashing but before decoding a
      // signature or touching JWKS. Business fields are validated only after
      // the signature succeeds.
      try {
        JSON.parse(rawBody);
      } catch {
        throw new Error("fal webhook body hash covers an unparseable body");
      }
      const signature = decodeSignature(headers.signature);
      if (signature.length !== 64) throw new Error("Invalid fal webhook signature");
      const keys = await options.resolvePublicKeys();
      if (!keys.some((key) => verify(null, Buffer.from(message), asPublicKey(key), signature))) throw new Error("Invalid fal webhook signature");
    },
  };
}

/** Useful for tests/diagnostics without exposing provider credentials. */
export function falWebhookBodyHash(rawBody: string): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function sameBodyHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

const FAL_WEBHOOK_JWKS_URL = "https://rest.alpha.fal.ai/.well-known/jwks.json";

export function createFalWebhookPublicKeyResolver(options: {
  fetchImpl?: typeof fetch;
  jwksUrl?: string;
  now?: () => number;
  cacheSeconds?: number;
} = {}): () => Promise<FalWebhookPublicKey[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const jwksUrl = options.jwksUrl ?? FAL_WEBHOOK_JWKS_URL;
  const now = options.now ?? (() => Date.now());
  const cacheMs = (options.cacheSeconds ?? 300) * 1000;
  let cached: { keys: FalWebhookPublicKey[]; expiresAt: number } | undefined;

  return async () => {
    if (cached && cached.expiresAt > now()) return cached.keys;
    const url = new URL(jwksUrl);
    if (url.protocol !== "https:" || url.hostname !== "rest.alpha.fal.ai") {
      throw new Error("Fal JWKS URL is not a trusted fal origin");
    }
    const response = await fetchImpl(url, { redirect: "manual" });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("Fal JWKS redirect is not trusted");
    }
    if (!response.ok) throw new Error(`Fal JWKS request failed (${response.status})`);
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") throw new Error("Fal JWKS response is not JSON");
    const payload = await response.json() as { keys?: JsonWebKey[] };
    const keys = (payload.keys ?? []).filter(
      (key) => key.kty === "OKP" && key.crv === "Ed25519" && typeof key.x === "string" && key.x.length > 0,
    );
    if (keys.length === 0) throw new Error("Fal JWKS contained no ED25519 public keys");
    cached = { keys, expiresAt: now() + cacheMs };
    return keys;
  };
}
