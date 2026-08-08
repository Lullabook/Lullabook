import { LIVE_FAL_RUN_APPROVED_ENV } from "@/services/fal-jwks";
import {
  LIVE_FAL_DEFAULT_CAP_USD,
  LIVE_FAL_DEFAULT_WARNING_AT_USD,
} from "@/services/live-fal-spend-cap";
import { FAL_TRAINING_BUDGET_MS } from "@/services/fal-training-watchdog";

/**
 * Ticket 208 / COST-2 — the live five-Persona fal.ai training run REPORTER.
 *
 * The live run is fail-closed: without the `LIVE_PROVIDER_RUN_APPROVED=true`
 * operator opt-in (and the rest of its preconditions) this reports BLOCKED and
 * names the exact reason. It NEVER reports PASS, never contacts fal.ai, and
 * never spends: only an actually-executed, evidenced run may claim PASS, and a
 * missing precondition must read as BLOCKED rather than a green tick.
 *
 * The planner is pure over an environment snapshot, so the CLI is a thin
 * printer and every branch is deterministically testable.
 */
export const LIVE_LORA_RUN_PERSONA_COUNT = 5;
export const LIVE_LORA_RUN_PERSONA_IDS_ENV = "LIVE_FAL_RUN_PERSONA_IDS";

export type LiveLoraTrainingRunStatus = "BLOCKED" | "READY";

export interface LiveLoraTrainingRunBlocker {
  code: string;
  reason: string;
}

export interface LiveLoraTrainingRunPlan {
  status: LiveLoraTrainingRunStatus;
  blockers: LiveLoraTrainingRunBlocker[];
  /** The primary (first) blocking reason, or "" when nothing blocks. */
  reason: string;
  /**
   * Never 0. 2 = blocked; 3 = preconditions satisfied but NO run happened —
   * this reporter cannot spend, so a green exit would read as a PASS that was
   * never earned.
   */
  exitCode: number;
  /** Structural proof this reporter is not a provider client. */
  providerCallsAttempted: 0;
  capUsd: number;
  warningAtUsd: number;
  personaCount: number;
  trainingBudgetMs: number;
  lines: string[];
}

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function personaIds(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function planLiveLoraTrainingRun(
  env: Record<string, string | undefined> = process.env,
): LiveLoraTrainingRunPlan {
  const blockers: LiveLoraTrainingRunBlocker[] = [];
  if (env[LIVE_FAL_RUN_APPROVED_ENV] !== "true") {
    blockers.push({
      code: "live_run_not_approved",
      reason: `${LIVE_FAL_RUN_APPROVED_ENV} is not set to "true" — the live fal.ai run is fail-closed and no provider call was attempted`,
    });
  }
  if (!env.FAL_API_KEY) {
    blockers.push({
      code: "fal_api_key_missing",
      reason: "FAL_API_KEY is not configured — a live fal.ai training cannot be submitted",
    });
  }
  if (!env.NEXT_PUBLIC_APP_URL) {
    blockers.push({
      code: "callback_origin_missing",
      reason:
        "NEXT_PUBLIC_APP_URL is not configured — the training callback would be unreachable (issue 203 / FAIL-6)",
    });
  }
  const personas = personaIds(env[LIVE_LORA_RUN_PERSONA_IDS_ENV]);
  if (personas.length !== LIVE_LORA_RUN_PERSONA_COUNT) {
    blockers.push({
      code: "consented_personas_missing",
      reason: `${LIVE_LORA_RUN_PERSONA_IDS_ENV} must name exactly ${LIVE_LORA_RUN_PERSONA_COUNT} consented Personas with moderated real photos (found ${personas.length})`,
    });
  }

  const capUsd = envNumber(env.FAL_LIVE_SPEND_CAP_USD, LIVE_FAL_DEFAULT_CAP_USD);
  const warningAtUsd = envNumber(env.FAL_LIVE_SPEND_WARN_AT_USD, LIVE_FAL_DEFAULT_WARNING_AT_USD);
  const status: LiveLoraTrainingRunStatus = blockers.length === 0 ? "READY" : "BLOCKED";
  const reason = blockers[0]?.reason ?? "";

  const lines = [
    `Live fal.ai LoRA training run — ${LIVE_LORA_RUN_PERSONA_COUNT} Personas`,
    `Spend cap: $${capUsd} (checkpoint at $${warningAtUsd}) — fail-closed`,
    `Per-training budget: ${Math.round(FAL_TRAINING_BUDGET_MS / 60000)} minutes, reconciled by the training watchdog`,
    `RESULT: ${status}${reason ? ` — ${reason}` : ""}`,
    ...blockers.map((blocker) => `  BLOCKER[${blocker.code}]: ${blocker.reason}`),
    status === "BLOCKED"
      ? "No fal.ai request was made. This is not a PASS."
      : "Preconditions satisfied, but this reporter makes no provider call and ran no training. No fal.ai request was made. This is not a PASS.",
  ];

  return {
    status,
    blockers,
    reason,
    exitCode: status === "BLOCKED" ? 2 : 3,
    providerCallsAttempted: 0,
    capUsd,
    warningAtUsd,
    personaCount: LIVE_LORA_RUN_PERSONA_COUNT,
    trainingBudgetMs: FAL_TRAINING_BUDGET_MS,
    lines,
  };
}
