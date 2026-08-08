import { createHash } from "node:crypto";
import type {
  BlobStore,
  FalAdapter,
  FalTrainingLifecycle,
  FalTrainingRequestRecord,
  FalTrainingStatusQuery,
  FalTrainingStatusResult,
} from "@/adapters/types";
import type { DataStore } from "@/db/store";
import {
  asFalTrainingLifecycleRepository,
  type FalTrainingLifecycleRepository,
} from "@/db/fal-training-lifecycle";
import {
  createFalArtifactDownloader,
  FalArtifactValidationError,
  redactProviderError,
  type ArtifactDownloader,
  type FalProviderResult,
} from "@/services/fal-lora-training";
import {
  completeFalTrainingResult,
  type PersonaReviewSampleGenerator,
} from "@/services/fal-training-completion";

/**
 * Ticket 208 — the fal LoRA training reconciliation watchdog (FAIL-4 / LAT-5).
 *
 * Training must never depend on the callback alone. This watchdog finds
 * in-flight training requests that have made no lifecycle progress, polls
 * fal.ai for their real status, and drives the SAME terminal transition a
 * signed callback would (shared `completeFalTrainingResult`). Two bounds make
 * the wait honest:
 *
 *  - `pollAfterMs` (default 2 min) — how long silence is tolerated before the
 *    provider is asked;
 *  - `budgetMs` (LAT-5, default 25 min from submit) — the wall-clock ceiling.
 *    A request still not terminal at the budget is terminalized `failed` with
 *    a redacted reason, so a Persona can never sit in an unbounded spinner.
 *
 * The watchdog only READS from the provider: it never submits, reserves, or
 * settles spend, so it cannot bypass or exhaust the $20 live cap (COST-1).
 */
export const FAL_TRAINING_BUDGET_MS = 25 * 60 * 1000;
export const FAL_TRAINING_POLL_AFTER_MS = 2 * 60 * 1000;
const DEFAULT_BATCH_LIMIT = 25;

export type FalTrainingStatusFetcher = (
  query: FalTrainingStatusQuery,
) => Promise<FalTrainingStatusResult>;

export interface FalTrainingWatchdogConfig {
  /** LAT-5 wall-clock budget measured from submit. Default 25 minutes. */
  budgetMs?: number;
  /** Silence tolerated before polling the provider. Default 2 minutes. */
  pollAfterMs?: number;
  /** Bound on one reconciliation pass. Default 25. */
  limit?: number;
}

export type FalTrainingWatchdogAction =
  /** fal reported a completed training; artifacts copied, Persona advanced. */
  | "advanced_ready"
  /** fal reported an error (or a malformed artifact): durable `failed`. */
  | "advanced_failed"
  /** past the LAT-5 budget with no terminal provider status: durable `failed`. */
  | "expired_failed"
  /** still training inside the budget; bounded progress recorded. */
  | "still_running"
  /** a callback already terminalized this request: nothing changed. */
  | "skipped_terminal"
  /** another worker holds the claim (poll raced a callback): nothing changed. */
  | "skipped_duplicate"
  /** the provider poll itself failed inside the budget: nothing changed. */
  | "poll_failed";

/** A visible, bounded progress state — never an unbounded spinner (LAT-5). */
export interface FalTrainingProgress {
  requestId: string;
  personaId: string;
  status: FalTrainingLifecycle;
  elapsedMs: number;
  budgetMs: number;
  /** Never negative: 0 means the budget is spent and the request is terminal. */
  remainingMs: number;
  deadlineAt: Date;
  terminal: boolean;
}

export interface FalTrainingWatchdogOutcome {
  requestId: string;
  personaId: string;
  action: FalTrainingWatchdogAction;
  status: FalTrainingLifecycle;
  progress: FalTrainingProgress;
  /** Redacted reason for a failed/expired/poll_failed outcome. */
  error?: string;
}

/**
 * Composition helper for the production trigger: build a watchdog from the
 * request context's provider/storage seams, or `null` when the configured fal
 * adapter cannot read queue status (a dev-only fake). Returning `null` keeps
 * the caller honest — an unreconcilable provider is never silently treated as
 * a healthy one.
 */
export function createFalTrainingWatchdog(dependencies: {
  persistence: DataStore | FalTrainingLifecycleRepository;
  blobs: BlobStore;
  fal: FalAdapter;
  download?: ArtifactDownloader;
  now?: () => Date;
  config?: FalTrainingWatchdogConfig;
  sampleGenerator?: PersonaReviewSampleGenerator;
}): FalTrainingWatchdogService | null {
  if (typeof dependencies.fal.fetchTrainingStatus !== "function") return null;
  return new FalTrainingWatchdogService(
    dependencies.persistence,
    dependencies.blobs,
    falAdapterStatusFetcher(dependencies.fal),
    dependencies.download ?? createFalArtifactDownloader(),
    dependencies.now,
    dependencies.config,
    dependencies.sampleGenerator,
  );
}

/** Adapter-backed status seam; a provider without one cannot be reconciled. */
export function falAdapterStatusFetcher(fal: FalAdapter): FalTrainingStatusFetcher {
  return async (query) => {
    if (!fal.fetchTrainingStatus) {
      throw new Error("Fal adapter cannot fetch training status");
    }
    return fal.fetchTrainingStatus(query);
  };
}

export class FalTrainingWatchdogService {
  private readonly repository: FalTrainingLifecycleRepository;

  constructor(
    persistence: DataStore | FalTrainingLifecycleRepository,
    private readonly blobs: BlobStore,
    private readonly poll: FalTrainingStatusFetcher,
    private readonly download: ArtifactDownloader,
    private readonly now: () => Date = () => new Date(),
    private readonly config: FalTrainingWatchdogConfig = {},
    private readonly sampleGenerator?: PersonaReviewSampleGenerator,
  ) {
    this.repository = asFalTrainingLifecycleRepository(persistence, this.now);
  }

  budgetMs(): number {
    return this.config.budgetMs ?? FAL_TRAINING_BUDGET_MS;
  }

  private pollAfterMs(): number {
    return this.config.pollAfterMs ?? FAL_TRAINING_POLL_AFTER_MS;
  }

  /** Bounded progress for one request against the LAT-5 budget. */
  progressFor(request: FalTrainingRequestRecord, status?: FalTrainingLifecycle): FalTrainingProgress {
    const current = status ?? request.status;
    const elapsedMs = Math.max(0, this.now().getTime() - request.createdAt.getTime());
    const budgetMs = this.budgetMs();
    const terminal = current === "ready" || current === "failed";
    return {
      requestId: request.requestId,
      personaId: request.personaId,
      status: current,
      elapsedMs,
      budgetMs,
      remainingMs: terminal ? 0 : Math.max(0, budgetMs - elapsedMs),
      deadlineAt: new Date(request.createdAt.getTime() + budgetMs),
      terminal,
    };
  }

  /**
   * One reconciliation pass: find stale in-flight trainings, poll fal for each,
   * and drive the terminal transition. Every request is bounded — nothing is
   * left in-flight past the budget.
   */
  async reconcile(): Promise<FalTrainingWatchdogOutcome[]> {
    const now = this.now();
    const stale = await this.repository.listInFlight({
      idleSince: new Date(now.getTime() - this.pollAfterMs()),
      // LAT-5 backstop: anything submitted before this instant is past its
      // budget and must be terminalized on THIS pass, idle or not.
      deadlineBefore: new Date(now.getTime() - this.budgetMs()),
      limit: this.config.limit ?? DEFAULT_BATCH_LIMIT,
    });
    const outcomes: FalTrainingWatchdogOutcome[] = [];
    for (const request of stale) {
      outcomes.push(await this.reconcileOne(request));
    }
    return outcomes;
  }

  private async reconcileOne(request: FalTrainingRequestRecord): Promise<FalTrainingWatchdogOutcome> {
    // Defensive: a listing is a snapshot, so re-check before touching anything.
    if (request.status === "ready" || request.status === "failed") {
      return this.outcome(request, "skipped_terminal", request.status);
    }
    const overBudget = this.elapsedMs(request) >= this.budgetMs();

    let polled: FalTrainingStatusResult;
    try {
      polled = await this.poll({
        requestId: request.requestId,
        endpoint: request.endpoint,
        ...(request.statusUrl ? { statusUrl: request.statusUrl } : {}),
      });
    } catch (error) {
      const reason = redactProviderError(error);
      // Inside the budget an unreachable provider changes nothing (the next
      // pass retries); at the budget the request must still end terminally.
      return overBudget
        ? this.expire(request, `fal status poll failed past the training budget: ${reason}`)
        : { ...this.outcome(request, "poll_failed", request.status), error: reason };
    }

    if (polled.status === "IN_PROGRESS") {
      if (overBudget) {
        return this.expire(
          request,
          `fal training exceeded the ${Math.round(this.budgetMs() / 60000)} minute budget without a terminal status`,
        );
      }
      return this.apply(request, { requestId: request.requestId, status: "IN_PROGRESS" }, "still_running");
    }
    if (polled.status === "ERROR") {
      return this.apply(
        request,
        {
          requestId: request.requestId,
          status: "ERROR",
          error: polled.error ?? "fal training failed",
        },
        "advanced_failed",
      );
    }
    return this.apply(
      request,
      { requestId: request.requestId, status: "OK", payload: polled.payload },
      "advanced_ready",
    );
  }

  /** Terminalize a past-budget training as a durable, redacted failure. */
  private expire(request: FalTrainingRequestRecord, reason: string): Promise<FalTrainingWatchdogOutcome> {
    return this.apply(
      request,
      { requestId: request.requestId, status: "ERROR", error: reason },
      "expired_failed",
    );
  }

  private async apply(
    request: FalTrainingRequestRecord,
    result: FalProviderResult,
    intended: FalTrainingWatchdogAction,
  ): Promise<FalTrainingWatchdogOutcome> {
    const fingerprint = this.fingerprint(request, result);
    try {
      const completion = await completeFalTrainingResult({
        repository: this.repository,
        blobs: this.blobs,
        result,
        fingerprint,
        download: this.download,
        sampleGenerator: this.sampleGenerator,
      });
      if (completion.outcome === "duplicate") {
        return this.outcome(request, "skipped_duplicate", request.status);
      }
      if (completion.outcome === "already_terminal") {
        const status = completion.claim?.request.status ?? request.status;
        return {
          ...this.outcome(request, "skipped_terminal", status),
          ...(completion.claim?.request.error ? { error: completion.claim.request.error } : {}),
        };
      }
      const status: FalTrainingLifecycle =
        completion.outcome === "ready" ? "ready" : completion.outcome === "failed" ? "failed" : "running";
      return {
        ...this.outcome(request, intended, status),
        ...(result.status === "ERROR" ? { error: redactProviderError(result.error ?? "") } : {}),
      };
    } catch (error) {
      // A malformed/untrusted artifact already wrote the durable `failed`
      // state inside the shared completion (FAIL-3, no orphaned owned blob);
      // anything else released the claim and left the request in-flight for
      // the next pass.
      const reason = redactProviderError(error);
      const artifactRejected = error instanceof FalArtifactValidationError;
      return {
        ...this.outcome(
          request,
          artifactRejected ? "advanced_failed" : "poll_failed",
          artifactRejected ? "failed" : request.status,
        ),
        error: reason,
      };
    }
  }

  /**
   * Deterministic claim fingerprint. Terminal results are keyed by request +
   * status ONLY, so re-polling the same terminal result is a duplicate rather
   * than a second advance; progress polls include the pass timestamp so
   * bounded progress can still be recorded each pass.
   */
  private fingerprint(request: FalTrainingRequestRecord, result: FalProviderResult): string {
    const terminal = result.status === "OK" || result.status === "ERROR";
    const material = terminal
      ? `watchdog\n${request.requestId}\n${result.status}`
      : `watchdog\n${request.requestId}\n${result.status}\n${this.now().toISOString()}`;
    return createHash("sha256").update(material).digest("hex");
  }

  private elapsedMs(request: FalTrainingRequestRecord): number {
    return Math.max(0, this.now().getTime() - request.createdAt.getTime());
  }

  private outcome(
    request: FalTrainingRequestRecord,
    action: FalTrainingWatchdogAction,
    status: FalTrainingLifecycle,
  ): FalTrainingWatchdogOutcome {
    return {
      requestId: request.requestId,
      personaId: request.personaId,
      action,
      status,
      progress: this.progressFor(request, status),
    };
  }
}
