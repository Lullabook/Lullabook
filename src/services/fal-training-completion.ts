import type { BlobStore } from "@/adapters/types";
import type {
  FalTrainingCallbackClaim,
  FalTrainingLifecycleRepository,
} from "@/db/fal-training-lifecycle";
import {
  copyValidatedTrainingArtifacts,
  FalArtifactValidationError,
  redactProviderError,
  type ArtifactDownloader,
  type FalProviderResult,
} from "@/services/fal-lora-training";

/**
 * Generates the Family-owned likeness-review samples a successful training
 * completion persists with the `training -> review` transition. Sample
 * generation is idempotent per training request (deterministic idempotency
 * keys and generation IDs), so a lease-reclaimed retry regenerates the same
 * keys instead of accumulating orphan samples.
 */
export interface PersonaReviewSampleGenerator {
  generate(
    request: { requestId: string; familyId: string; personaId: string },
    loraWeightKey: string,
  ): Promise<string[]>;
}

export type FalTrainingCompletionOutcome =
  | "ready"
  | "failed"
  | "running"
  | "duplicate"
  | "already_terminal";

export interface FalTrainingCompletionResult {
  duplicate: boolean;
  outcome: FalTrainingCompletionOutcome;
  /** The claimed request as it was BEFORE this completion (undefined on duplicate). */
  claim?: FalTrainingCallbackClaim;
}

/**
 * The ONE terminal transition for a fal training result, shared by the signed
 * webhook (issue 205) and the reconciliation watchdog (ticket 208 / FAIL-4) so
 * both drive identical state:
 *
 *  - the fingerprinted claim is the duplicate/stale guard — a second arrival
 *    for the same fingerprint, or an arrival while another worker holds the
 *    lease, returns `duplicate` and changes nothing;
 *  - a request already `ready`/`failed` is acknowledged without copying
 *    artifacts or moving the Persona (never double-advanced);
 *  - `ERROR` becomes a durable `failed` with a redacted reason (FAIL-3);
 *  - `OK` copies the artifacts into Family-owned storage, generates review
 *    samples, and completes `ready` in the repository transaction.
 *
 * Nothing here reserves or settles provider spend: reconciliation reads
 * provider state, so it can never bypass the live spend cap (COST-1).
 */
export async function completeFalTrainingResult(options: {
  repository: FalTrainingLifecycleRepository;
  blobs: BlobStore;
  result: FalProviderResult;
  fingerprint: string;
  download?: ArtifactDownloader;
  sampleGenerator?: PersonaReviewSampleGenerator;
  leaseSeconds?: number;
}): Promise<FalTrainingCompletionResult> {
  const { repository, blobs, result, fingerprint } = options;
  const claim = await repository.claimCallback(result.requestId, fingerprint, options.leaseSeconds);
  if (claim.duplicate) return { duplicate: true, outcome: "duplicate" };

  try {
    if (claim.request.status === "ready" || claim.request.status === "failed") {
      // Stale or out-of-order arrival: acknowledge without copying artifacts or
      // moving the Persona (the SQL completion only transitions `training`).
      await repository.completeCallback({
        requestId: result.requestId,
        fingerprint,
        status: claim.request.status,
        loraWeightKey: claim.request.loraWeightKey,
        configurationKey: claim.request.configurationKey,
        error: claim.request.error,
      });
      return { duplicate: false, outcome: "already_terminal", claim };
    }
    if (result.status === "IN_PROGRESS") {
      await repository.completeCallback({ requestId: result.requestId, fingerprint, status: "running" });
      return { duplicate: false, outcome: "running", claim };
    }
    if (result.status === "ERROR") {
      // A real training failure marks the Persona `failed` with a redacted
      // terminal reason and consumes no Storybook allowance.
      await repository.completeCallback({
        requestId: result.requestId,
        fingerprint,
        status: "failed",
        error: redactProviderError(result.error ?? "fal training failed"),
      });
      return { duplicate: false, outcome: "failed", claim };
    }

    const download = options.download;
    if (!download) throw new Error("Training result must include an artifact downloader");
    const owned = await copyValidatedTrainingArtifacts(claim.request, result, blobs, download);
    const sampleKeys = options.sampleGenerator
      ? await options.sampleGenerator.generate(claim.request, owned.loraWeightKey)
      : [];
    await repository.completeCallback({
      requestId: result.requestId,
      fingerprint,
      status: "ready",
      loraWeightKey: owned.loraWeightKey,
      configurationKey: owned.configurationKey,
      reviewSampleKeys: sampleKeys,
    });
    return { duplicate: false, outcome: "ready", claim };
  } catch (error) {
    if (error instanceof FalArtifactValidationError) {
      await repository.completeCallback({
        requestId: result.requestId,
        fingerprint,
        status: "failed",
        error: redactProviderError(error),
      });
    } else {
      await repository.releaseCallback(result.requestId, fingerprint);
    }
    throw error;
  }
}
