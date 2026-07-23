import {
  createProviderBakeoffConfig,
  DEFAULT_PROVIDER_BAKEOFF_MANIFEST,
  runProviderBakeoff,
  type ProviderBakeoffAdapters,
  type ProviderBakeoffOperation,
} from "../src/services/provider-bakeoff";

const LIVE_ADAPTERS_NOT_WIRED =
  "Live provider adapters are not wired by the deterministic contract harness; provide a separately reviewed paid-run adapter implementation.";

function unavailable(operation: ProviderBakeoffOperation): never {
  throw new Error(`${LIVE_ADAPTERS_NOT_WIRED} Operation: ${operation.operationId}`);
}

const adapters: ProviderBakeoffAdapters = {
  fal: {
    startTraining: async () => unavailable({} as ProviderBakeoffOperation),
    submitTraining: async () => unavailable({} as ProviderBakeoffOperation),
    generateImage: async () => unavailable({} as ProviderBakeoffOperation),
    inpaintFaces: async () => unavailable({} as ProviderBakeoffOperation),
    generateWithReferenceModel: async () => unavailable({} as ProviderBakeoffOperation),
    runTraining: async (operation) => unavailable(operation),
    runGeneration: async (operation) => unavailable(operation),
    runRepair: async (operation) => unavailable(operation),
  },
  anthropic: {
    generateStory: async () => unavailable({} as ProviderBakeoffOperation),
    generateTextStory: async () => unavailable({} as ProviderBakeoffOperation),
    adaptStory: async () => unavailable({} as ProviderBakeoffOperation),
    generateCharacterDescription: async () => unavailable({} as ProviderBakeoffOperation),
    runStoryGeneration: async (operation) => unavailable(operation),
  },
};

async function main(): Promise<void> {
  let config;
  try {
    config = createProviderBakeoffConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const report = await runProviderBakeoff({
    config,
    adapters,
  });
  console.log(JSON.stringify({ manifest: DEFAULT_PROVIDER_BAKEOFF_MANIFEST, report }, null, 2));
  // A blocked report is evidence that the gate held, not a successful paid run.
  process.exitCode = report.decision.status === "blocked" ? 2 : 0;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
