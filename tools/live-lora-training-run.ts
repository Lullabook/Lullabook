#!/usr/bin/env npx tsx
/**
 * Ticket 208 / COST-2 — honest status of the live five-Persona fal.ai LoRA
 * training run. Prints BLOCKED with the exact reason (and exits 2) whenever a
 * precondition — above all `LIVE_PROVIDER_RUN_APPROVED=true` — is missing.
 *
 * This tool NEVER calls fal.ai and never spends: it reads the environment and
 * reports. Run: npm run report:live-lora-training
 */
import { planLiveLoraTrainingRun } from "@/services/live-lora-training-run";

const plan = planLiveLoraTrainingRun(process.env);
for (const line of plan.lines) console.log(line);
process.exit(plan.exitCode);
