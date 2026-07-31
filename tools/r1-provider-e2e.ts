import {
  createR1ProviderE2EConfig,
  DEFAULT_R1_PROVIDER_E2E_MANIFEST,
  runR1ProviderE2E,
} from "../src/services/r1-provider-e2e";
import { createDeterministicR1ProviderE2EComposition } from "../src/services/r1-provider-e2e-deterministic";

const PRODUCTION_COMPOSITION_BLOCKERS = [
  "No reviewed authenticated Supabase fixture runner is checked in for the native R1 route graph",
  "No approved synthetic/consenting-adult fixture manifest is bound to a production Family",
  "No reviewed live fault-injection and signed callback-capture seam exists for the required recovery stages",
  "Actual billed provider cost reconciliation is not wired into this deterministic runner",
] as const;

async function main(): Promise<void> {
  let config;
  try {
    config = createR1ProviderE2EConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  // This checked-in command exercises the complete service composition without
  // provider spend. Deterministic provenance is intentionally release-ineligible;
  // a future paid runner must supply a separately reviewed real-provider composition.
  const report = await runR1ProviderE2E({
    config,
    composition: createDeterministicR1ProviderE2EComposition(),
  });
  console.log(JSON.stringify({
    manifest: DEFAULT_R1_PROVIDER_E2E_MANIFEST,
    productionBlockers: PRODUCTION_COMPOSITION_BLOCKERS,
    report,
  }, null, 2));
  // A blocked report is evidence that the gate held, not a successful paid run.
  process.exitCode = report.decision.status === "blocked" ? 2 : 0;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
