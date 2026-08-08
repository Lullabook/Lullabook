import {
  createFalWebhookPublicKeyResolver,
  createFalWebhookVerifier,
  type FalWebhookHeaders,
  type FalWebhookPublicKey,
} from "@/adapters/fal-webhook";

/**
 * Issue 205 / SEC-4 — the JWKS fetch + verify seam.
 *
 * A fal.ai training callback is only trusted once its timestamp, body hash,
 * and ED25519 signature verify against fal's live public keys published on its
 * JWKS endpoint. This service owns that fetch (cached) and the verification
 * bound to it, so a callback is rejected before any business data is parsed
 * unless all three hold (the underlying {@link createFalWebhookVerifier}
 * checks freshness + body hash + signature BEFORE JSON body parse or dispatch).
 *
 * Deterministic tests fake the JWKS endpoint by injecting a `fetchImpl` that
 * returns a fixture JWKS document — the live network is never touched in
 * tests. The live fetch itself stays behind the same `LIVE_PROVIDER_RUN_APPROVED`
 * opt-in the spend cap (issue 204) requires: a deployment that has not approved
 * a live-provider run fails closed instead of phoning fal's key endpoint.
 * Ticket 208 separately proves the real (non-injected) live fetch against fal.
 */
export interface FalJwksConfig {
  /** fal JWKS URL. Defaults to fal's canonical endpoint. */
  jwksUrl?: string;
  /** Cache TTL for resolved public keys, in seconds (default 300). */
  cacheSeconds?: number;
  /** Maximum accepted callback age, in seconds (default 300). */
  maxAgeSeconds?: number;
  /** Seconds clock used for timestamp freshness / cache expiry. */
  now?: () => number;
  /**
   * `LIVE_PROVIDER_RUN_APPROVED` opt-in; only the exact value "true" unlocks
   * the live JWKS fetch. Omitted → read from `process.env`.
   */
  liveRunApproved?: string;
  /** Injected fetch for deterministic JWKS resolution; default the global fetch. */
  fetchImpl?: typeof fetch;
  /** Observability callback fired after the body hash is computed. */
  onBodyHash?: () => void;
}

export const LIVE_FAL_RUN_APPROVED_ENV = "LIVE_PROVIDER_RUN_APPROVED";

export interface FalJwksSeam {
  /** Whether the live-provider opt-in is set (fail-closed gate). */
  liveApproved(): boolean;
  /** Resolve fal's current JWKS public keys (cached). */
  resolvePublicKeys(): Promise<FalWebhookPublicKey[]>;
  /**
   * Verify timestamp + body hash + signature against fal's JWKS keys. Throws
   * before any business parsing / dispatch when verification fails (SEC-4).
   */
  verify(headers: FalWebhookHeaders, rawBody: string): Promise<void>;
}

export class FalJwksService implements FalJwksSeam {
  private readonly resolver: () => Promise<FalWebhookPublicKey[]>;
  private readonly verifier: ReturnType<typeof createFalWebhookVerifier>;
  private readonly options: FalJwksConfig;

  constructor(options: FalJwksConfig = {}) {
    this.options = options;
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    this.resolver = createFalWebhookPublicKeyResolver({
      // The default fetch is the real (live-provider) boundary; tests inject a
      // fake that serves a fixture JWKS document so nothing touches the network.
      fetchImpl: options.fetchImpl ?? fetch,
      jwksUrl: options.jwksUrl,
      cacheSeconds: options.cacheSeconds,
    });
    this.verifier = createFalWebhookVerifier({
      now,
      maxAgeSeconds: options.maxAgeSeconds,
      resolvePublicKeys: () => this.resolvePublicKeys(),
      onBodyHash: options.onBodyHash,
    });
  }

  liveApproved(): boolean {
    const optIn = this.options.liveRunApproved ?? process.env[LIVE_FAL_RUN_APPROVED_ENV];
    return optIn === "true";
  }

  async resolvePublicKeys(): Promise<FalWebhookPublicKey[]> {
    // Live key fetch stays behind the live-provider opt-in (mirrors the spend
    // cap): a non-opt-in deployment fails closed rather than phoning fal.
    if (!this.liveApproved()) {
      throw new Error(
        `Live fal JWKS verification requires ${LIVE_FAL_RUN_APPROVED_ENV}=true`,
      );
    }
    return this.resolver();
  }

  async verify(headers: FalWebhookHeaders, rawBody: string): Promise<void> {
    await this.verifier.verify(headers, rawBody);
  }
}