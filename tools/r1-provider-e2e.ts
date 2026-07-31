import { RealAnthropicAdapter } from "@/adapters/anthropic";
import { RealFalAdapter } from "@/adapters/fal";
import {
  createR1ProviderE2EConfig,
  DEFAULT_R1_PROVIDER_E2E_MANIFEST,
  runR1ProviderE2E,
  type R1ProviderE2EAdapters,
} from "@/services/r1-provider-e2e";

const LIVE_ADAPTERS_NOT_WIRED =
  "Live provider adapters are not wired: set FAL_API_KEY and ANTHROPIC_API_KEY to authorize a real-provider run.";

function createAdapters(isLive: boolean): R1ProviderE2EAdapters {
  return {
    liveAdaptersWired: isLive,
    fal: {
      available: isLive,
      isDevOnly: !isLive,
      evidenceSource: isLive ? "real-provider" : "deterministic",
      run: async (operation) => {
        throw new Error(`${LIVE_ADAPTERS_NOT_WIRED} Operation: ${operation.operationId}`);
      },
    },
    anthropic: {
      available: isLive,
      isDevOnly: !isLive,
      evidenceSource: isLive ? "real-provider" : "deterministic",
      run: async (operation) => {
        throw new Error(`${LIVE_ADAPTERS_NOT_WIRED} Operation: ${operation.operationId}`);
      },
    },
  };
}

async function main(): Promise<void> {
  let config;
  try {
    config = createR1ProviderE2EConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const isLive =
    Boolean(config.credentials.fal) &&
    Boolean(config.credentials.anthropic) &&
    process.env.R1_PROVIDER_E2E_LIVE === "true";

  const adapters = createAdapters(isLive);
  const serviceAdapters = isLive
    ? {
        fal: new RealFalAdapter(),
        anthropic: new RealAnthropicAdapter(),
      }
    : undefined;

  const report = await runR1ProviderE2E({ config, adapters, serviceAdapters });
  console.log(JSON.stringify({ manifest: DEFAULT_R1_PROVIDER_E2E_MANIFEST, report }, null, 2));

  if (!isLive) {
    // A blocked report without live adapters is evidence that the gate held.
    process.exitCode = report.decision.status === "blocked" ? 2 : 0;
    return;
  }

  // Live run: exit 0 only when the gate actually passes. Do not treat a live
  // blocked or failed gate as a successful release authorization.
  process.exitCode = report.decision.status === "passed" ? 0 : 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
