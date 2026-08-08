/**
 * Issue 203 / FAIL-6 — reachability preflight for the fal.ai training callback.
 *
 * The training submission path calls this BEFORE any fal.ai request is made and
 * BEFORE any spend is reserved. When the configured public callback origin is
 * unreachable, submission fails closed (no fal request, no reservation) with an
 * error naming the unreachable callback URL — because a training whose callback
 * can never arrive is money spent with no way to learn the result.
 *
 * Deterministic and safe: the network probe is injected (a fake at the fetch
 * seam), so tests never touch the live network. When no callback origin is
 * configured in the current runtime the probe is skipped, leaving the seed the
 * $20 spend cap and `LIVE_PROVIDER_RUN_APPROVED` gate; the strict
 * `assertCallbackOriginConfigured` guard still fails closed at startup for a
 * deployment that claims to run live training.
 */
import { CALLBACK_ORIGIN_ENV, callbackEndpointUrl, resolveCallbackOrigin } from "@/services/callback-origin";
import { optionalEnv } from "@/adapters/env";

export class CallbackUnreachableError extends Error {
  readonly status = 503;
  constructor(callbackUrl: string) {
    super(`fal.ai training callback URL is unreachable: ${callbackUrl}`);
    this.name = "CallbackUnreachableError";
  }
}

export interface CallbackReachabilityConfig {
  /** Overrides the env-derived origin (test/explicit wiring). */
  callbackBaseUrl?: string;
  /** Replaces global fetch so the probe is deterministic and never hits the network. */
  fetchImpl?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

export interface CallbackReachabilityResult {
  ok: boolean;
  /** Present when unreachable: the callback URL that failed the probe. */
  error?: string;
}

export class CallbackReachabilityPreflight {
  private readonly fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

  constructor(private readonly config: CallbackReachabilityConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  /** The configured callback origin, or undefined when not configured in this runtime. */
  configuredOrigin(): string | undefined {
    return this.config.callbackBaseUrl ?? optionalEnv(CALLBACK_ORIGIN_ENV);
  }

  /** The exact callback endpoint derived from the configured origin. */
  callbackUrl(): string {
    return callbackEndpointUrl(this.resolveOrigin());
  }

  private resolveOrigin(): string {
    return this.config.callbackBaseUrl ?? resolveCallbackOrigin();
  }

  /**
   * Reachability probe against the configured callback endpoint. Any HTTP
   * round-trip (including 4xx/5xx) proves DNS + routing + a live origin, so it
   * counts as reachable; only a network-level failure marks it unreachable.
   * Fails closed on a configured-but-unreachable origin.
   */
  async check(): Promise<CallbackReachabilityResult> {
    const origin = this.configuredOrigin();
    if (!origin) return { ok: true };
    const url = this.callbackUrl();
    try {
      const response = await this.fetchImpl(url);
      if (!response) return { ok: false, error: url };
      return { ok: true };
    } catch {
      return { ok: false, error: url };
    }
  }
}
