import {
  createR1ProviderE2EConfig,
  DEFAULT_R1_PROVIDER_E2E_MANIFEST,
  runR1ProviderE2E,
  type R1ProviderE2EAdapters,
  type R1ProviderE2EOperation,
} from "../src/services/r1-provider-e2e";

const LIVE_ADAPTERS_NOT_WIRED =
  "Live provider adapters are not wired by the deterministic contract harness; provide a separately reviewed, separately authorized paid-run adapter implementation.";

function unavailable(operation: R1ProviderE2EOperation): never {
  throw new Error(`${LIVE_ADAPTERS_NOT_WIRED} Operation: ${operation.operationId}`);
}

const adapters: R1ProviderE2EAdapters = {
  liveAdaptersWired: false,
  fal: {
    available: false,
    run: async (operation) => unavailable(operation),
  },
  anthropic: {
    available: false,
    run: async (operation) => unavailable(operation),
  },
};

async function main(): Promise<void> {
  let config;
  try {
    config = createR1ProviderE2EConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const report = await runR1ProviderE2E({ config, adapters });
  console.log(JSON.stringify({ manifest: DEFAULT_R1_PROVIDER_E2E_MANIFEST, report }, null, 2));
  // A blocked report is evidence that the gate held, not a successful paid run.
  process.exitCode = report.decision.status === "blocked" ? 2 : 0;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
