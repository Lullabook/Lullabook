import { createLiveProviderBakeoffAdapters } from "../src/adapters/provider-bakeoff-live";
import { SupabaseProviderBakeoffRepository } from "../src/db/provider-bakeoff";
import { createServiceClient } from "../src/lib/supabase";
import {
  createProviderBakeoffConfig,
  DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
  DEFAULT_PROVIDER_BAKEOFF_MANIFEST,
  runProviderBakeoff,
  validateProviderBakeoffFixture,
} from "../src/services/provider-bakeoff";

async function main(): Promise<void> {
  let config;
  try {
    // Authorization, credentials, and the hard budget are checked before any
    // production adapter or durable repository can reach the network.
    config = createProviderBakeoffConfig();
    validateProviderBakeoffFixture(DEFAULT_PROVIDER_BAKEOFF_FIXTURE);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const adapters = createLiveProviderBakeoffAdapters(DEFAULT_PROVIDER_BAKEOFF_FIXTURE);
  const repository = new SupabaseProviderBakeoffRepository(createServiceClient());
  const report = await runProviderBakeoff({
    config,
    adapters,
    repository,
    fixture: DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
  });
  console.log(JSON.stringify({ manifest: DEFAULT_PROVIDER_BAKEOFF_MANIFEST, report }, null, 2));
  // A blocked report is evidence that the gate held, not a successful paid run.
  process.exitCode = report.decision.status === "blocked" ? 2 : 0;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
