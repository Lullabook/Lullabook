/**
 * Versioned R1 provider price table (issue 190 / ADR-0028).
 *
 * Every payable attempt derives a NON-ZERO estimated cost from this table
 * before the provider boundary; an unknown route fails closed (no provider
 * work priced as free). Pricing versions are the reconciliation key the
 * ledger stores with each attempt; bump the version when a price changes so
 * historical rows stay attributable.
 *
 * Prices are deterministic, versioned estimates used for pre-attempt
 * authorization and the COGS ledger. Final billed prices are reconciled from
 * provider invoices; the `$10` bakeoff (COST-4) owns final per-route pricing
 * approval — `ponytail: placeholder prices pending the COST-4 bakeoff, which
 * owns the real numbers; only non-zero-ness and versioning are load-bearing.
 */
export interface ProviderPriceRow {
  provider: string;
  endpoint: string;
  model: string;
  pricingVersion: string;
  /** Billing unit key, e.g. "input_tokens", "images". */
  unit: string;
  pricePerUnitUsd: number;
}

/** Wildcard model fallback: any model on this provider+endpoint prices identically. */
const ANY_MODEL = "*";

export const PROVIDER_PRICE_TABLE: ProviderPriceRow[] = [
  // --- Text (Anthropic) ---
  { provider: "anthropic", endpoint: "messages.create", model: "claude-sonnet-4-6", pricingVersion: "r1-text-v1", unit: "input_tokens", pricePerUnitUsd: 0.000003 },
  { provider: "anthropic", endpoint: "messages.create", model: "claude-sonnet-4-6", pricingVersion: "r1-text-v1", unit: "output_tokens", pricePerUnitUsd: 0.000015 },
  { provider: "anthropic", endpoint: "messages.create", model: "claude-sonnet-5", pricingVersion: "r1-text-v1", unit: "input_tokens", pricePerUnitUsd: 0.000005 },
  { provider: "anthropic", endpoint: "messages.create", model: "claude-sonnet-5", pricingVersion: "r1-text-v1", unit: "output_tokens", pricePerUnitUsd: 0.000025 },

  // --- Illustration (fal.ai) ---
  { provider: "fal.ai", endpoint: "fal-ai/flux-lora", model: "flux-1-lora", pricingVersion: "r1-image-v1", unit: "images", pricePerUnitUsd: 0.06 },
  { provider: "fal.ai", endpoint: "fal-ai/flux-2/lora", model: "flux-2-lora", pricingVersion: "r1-image-v1", unit: "images", pricePerUnitUsd: 0.067 },

  // --- Training (fal.ai) ---
  { provider: "fal.ai", endpoint: "fal-ai/flux-lora-fast-training", model: "flux-1-lora", pricingVersion: "r1-training-v1", unit: "trainings", pricePerUnitUsd: 0.4 },
  { provider: "fal.ai", endpoint: "fal-ai/flux-2-trainer-v2", model: "flux-2-lora-v2", pricingVersion: "r1-training-v1", unit: "trainings", pricePerUnitUsd: 0.4 },

  // --- Repair (fal.ai) ---
  { provider: "fal.ai", endpoint: "fal-ai/nano-banana-2/edit", model: "Nano Banana 2 Edit", pricingVersion: "r1-repair-v1", unit: "images", pricePerUnitUsd: 0.08 },
  { provider: "fal.ai", endpoint: "fal-ai/nano-banana-pro/edit", model: "Nano Banana Pro Edit", pricingVersion: "r1-repair-v1", unit: "images", pricePerUnitUsd: 0.12 },

  // --- Moderation (Sightengine) ---
  { provider: "sightengine", endpoint: "https://api.sightengine.com/1.0/check.json", model: "image-and-text", pricingVersion: "r1-moderation-v1", unit: "checks", pricePerUnitUsd: 0.01 },

  // --- Queue (Inngest) ---
  { provider: "inngest", endpoint: "events.send", model: "durable-workflow", pricingVersion: "r1-queue-v1", unit: "events", pricePerUnitUsd: 0.0001 },

  // --- Storage (Cloudflare R2) ---
  { provider: "cloudflare", endpoint: "r2.put", model: "object-storage", pricingVersion: "r1-storage-v1", unit: "objects", pricePerUnitUsd: 0.00001 },

  // Wildcard fallbacks: a model not listed on a known provider+endpoint still
  // prices (never free), using the endpoint's floor price.
  { provider: "anthropic", endpoint: "messages.create", model: ANY_MODEL, pricingVersion: "r1-text-v1", unit: "input_tokens", pricePerUnitUsd: 0.000003 },
  { provider: "anthropic", endpoint: "messages.create", model: ANY_MODEL, pricingVersion: "r1-text-v1", unit: "output_tokens", pricePerUnitUsd: 0.000015 },
  { provider: "fal.ai", endpoint: "fal-ai/flux-lora", model: ANY_MODEL, pricingVersion: "r1-image-v1", unit: "images", pricePerUnitUsd: 0.06 },
];

/**
 * Worst-case text-pass units (issue 190): the reservation before a payable
 * text attempt prices the ceiling, not the happy path. Output is bounded by
 * the adapter's MAX_TOKENS (24000); input is the 12-Page brief + context
 * ceiling. Non-zero by construction.
 */
export const TEXT_WORST_CASE_UNITS = { input_tokens: 32_000, output_tokens: 24_000 } as const;

export interface PriceEstimate {
  pricingVersion: string;
  estimatedCostUsd: number;
}

/**
 * Derive the versioned worst-case cost for a payable route. Exact model rows
 * win; a wildcard fallback prices known provider+endpoint combinations that
 * lack a model-specific row. Unknown routes and zero-cost attempts throw —
 * payable provider work is never free and never silently unpriced.
 */
export function estimateProviderCostUsd(input: {
  provider: string;
  endpoint: string;
  model: string;
  units: Record<string, number>;
}): PriceEstimate {
  const { provider, endpoint, model, units } = input;
  const onRoute = (row: ProviderPriceRow) =>
    row.provider === provider && row.endpoint === endpoint;
  const exact = PROVIDER_PRICE_TABLE.filter(
    (row) => onRoute(row) && row.model === model && row.model !== ANY_MODEL
  );
  const rows =
    exact.length > 0
      ? exact
      : PROVIDER_PRICE_TABLE.filter((row) => onRoute(row) && row.model === ANY_MODEL);
  if (rows.length === 0) {
    throw new Error(
      `No versioned price for payable route ${provider}/${endpoint}/${model}`
    );
  }

  let estimatedCostUsd = 0;
  const pricingVersions = new Set<string>();
  for (const row of rows) {
    pricingVersions.add(row.pricingVersion);
    const count = units[row.unit] ?? 0;
    if (!Number.isFinite(count) || count < 0) {
      throw new Error(`Invalid unit count for ${row.unit}`);
    }
    estimatedCostUsd += count * row.pricePerUnitUsd;
  }
  if (estimatedCostUsd <= 0) {
    throw new Error("A payable attempt must carry a non-zero estimated cost");
  }
  return { pricingVersion: [...pricingVersions].join("+"), estimatedCostUsd };
}
