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
      const signature = decodeSignature(headers.signature);
      if (signature.length !== 64) throw new Error("Invalid fal webhook signature");
      // Well-formedness gate before any key material is touched: an
      // unparseable body can never carry a legitimate provider result, so it
      // must not become a probe that triggers JWKS fetches. Structural JSON
      // parse only — business fields are validated after verification.
      try {
        JSON.parse(rawBody);
      } catch {
        throw new Error("fal webhook body hash covers an unparseable body");
      }
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
