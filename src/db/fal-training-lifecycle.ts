import type { SupabaseClient } from "@supabase/supabase-js";
import type { FalTrainingRequestRecord } from "@/adapters/types";
import type { DataStore } from "@/db/store";

export interface FalTrainingCallbackClaim {
  claimed: boolean;
  duplicate: boolean;
  request: FalTrainingRequestRecord;
}

export interface FalTrainingCallbackCompletion {
  requestId: string;
  fingerprint: string;
  status: "running" | "ready" | "failed";
  loraWeightKey?: string;
  configurationKey?: string;
  error?: string;
  /** Family-owned likeness-review sample keys persisted with a `ready` completion (ticket 188). */
  reviewSampleKeys?: string[];
}

/**
 * Ticket 208 / FAIL-4 — how the reconciliation watchdog FINDS trainings whose
 * callback never arrived: in-flight (`queued`/`running`) requests with no
 * lifecycle progress since `idleSince`. This is the production seam; the
 * DataStore implementation backs the deterministic tests.
 */
export interface FalTrainingInFlightQuery {
  /** Requests whose `updatedAt` is at or before this instant are stale. */
  idleSince: Date;
  /**
   * LAT-5 backstop: requests CREATED at or before this instant are listed even
   * when they are not idle. A watchdog heartbeat refreshes `updatedAt`, so an
   * idle-only listing could push a training's terminal transition past its
   * wall-clock budget; this arm makes the bound hold.
   */
  deadlineBefore: Date;
  /** Bound on one reconciliation pass (default 25). */
  limit?: number;
}

export interface FalTrainingLifecycleRepository {
  claimCallback(
    requestId: string,
    fingerprint: string,
    leaseSeconds?: number,
  ): Promise<FalTrainingCallbackClaim>;
  completeCallback(completion: FalTrainingCallbackCompletion): Promise<void>;
  releaseCallback(requestId: string, fingerprint: string): Promise<void>;
  /** Stale in-flight training requests, oldest first (ticket 208 / FAIL-4). */
  listInFlight(query: FalTrainingInFlightQuery): Promise<FalTrainingRequestRecord[]>;
}

const DEFAULT_IN_FLIGHT_LIMIT = 25;

function boundedLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_IN_FLIGHT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Fal training in-flight limit must be an integer between 1 and 100");
  }
  return limit;
}

export interface SqlQueryResult<Row extends Record<string, unknown>> {
  rows: Row[];
}

export type SystemSqlRunner = <Row extends Record<string, unknown>>(
  text: string,
  values?: unknown[],
) => Promise<SqlQueryResult<Row>>;

type ClaimRow = {
  claimed: boolean;
  duplicate: boolean;
  request_id: string;
  family_id: string;
  persona_id: string;
  endpoint: string;
  model: string;
  steps: number;
  idempotency_key: string;
  status: FalTrainingRequestRecord["status"];
  input_zip_key: string | null;
  lora_weight_key: string | null;
  configuration_key: string | null;
  error: string | null;
  status_url?: string | null;
  created_at: string | Date;
  updated_at: string | Date;
};

export class PostgresFalTrainingLifecycleRepository implements FalTrainingLifecycleRepository {
  constructor(private readonly query: SystemSqlRunner) {}

  async claimCallback(
    requestId: string,
    fingerprint: string,
    leaseSeconds = 60,
  ): Promise<FalTrainingCallbackClaim> {
    const result = await this.query<ClaimRow>(
      "select * from app_claim_fal_training_callback($1::text, $2::text, $3::integer)",
      [requestId, fingerprint, leaseSeconds],
    );
    return claimFromRow(result.rows[0]);
  }

  async completeCallback(completion: FalTrainingCallbackCompletion): Promise<void> {
    await this.query(
      "select app_complete_fal_training_callback($1::text, $2::text, $3::text, $4::text, $5::text, $6::text, $7::jsonb)",
      [
        completion.requestId,
        completion.fingerprint,
        completion.status,
        completion.loraWeightKey ?? null,
        completion.configurationKey ?? null,
        completion.error ?? null,
        completion.reviewSampleKeys ? JSON.stringify(completion.reviewSampleKeys) : null,
      ],
    );
  }

  async releaseCallback(requestId: string, fingerprint: string): Promise<void> {
    await this.query(
      "select app_release_fal_training_callback($1::text, $2::text)",
      [requestId, fingerprint],
    );
  }

  async listInFlight(query: FalTrainingInFlightQuery): Promise<FalTrainingRequestRecord[]> {
    const result = await this.query<ClaimRow>(
      "select * from app_list_stale_fal_training_requests($1::timestamptz, $2::timestamptz, $3::integer)",
      [query.idleSince.toISOString(), query.deadlineBefore.toISOString(), boundedLimit(query.limit)],
    );
    return result.rows.map(recordFromRow);
  }
}

export class SupabaseFalTrainingLifecycleRepository implements FalTrainingLifecycleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async claimCallback(
    requestId: string,
    fingerprint: string,
    leaseSeconds = 60,
  ): Promise<FalTrainingCallbackClaim> {
    const { data, error } = await this.client.rpc("app_claim_fal_training_callback", {
      p_request_id: requestId,
      p_fingerprint: fingerprint,
      p_lease_seconds: leaseSeconds,
    });
    if (error) throw new Error(`Claim fal callback failed: ${error.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | undefined;
    return claimFromRow(row);
  }

  async completeCallback(completion: FalTrainingCallbackCompletion): Promise<void> {
    const { error } = await this.client.rpc("app_complete_fal_training_callback", {
      p_request_id: completion.requestId,
      p_fingerprint: completion.fingerprint,
      p_status: completion.status,
      p_lora_weight_key: completion.loraWeightKey ?? null,
      p_configuration_key: completion.configurationKey ?? null,
      p_error: completion.error ?? null,
      p_review_sample_keys: completion.reviewSampleKeys ?? null,
    });
    if (error) throw new Error(`Complete fal callback failed: ${error.message}`);
  }

  async releaseCallback(requestId: string, fingerprint: string): Promise<void> {
    const { error } = await this.client.rpc("app_release_fal_training_callback", {
      p_request_id: requestId,
      p_fingerprint: fingerprint,
    });
    if (error) throw new Error(`Release fal callback failed: ${error.message}`);
  }

  async listInFlight(query: FalTrainingInFlightQuery): Promise<FalTrainingRequestRecord[]> {
    const { data, error } = await this.client.rpc("app_list_stale_fal_training_requests", {
      p_idle_since: query.idleSince.toISOString(),
      p_deadline_before: query.deadlineBefore.toISOString(),
      p_limit: boundedLimit(query.limit),
    });
    if (error) throw new Error(`List in-flight fal trainings failed: ${error.message}`);
    return ((data ?? []) as ClaimRow[]).map(recordFromRow);
  }
}

export class DataStoreFalTrainingLifecycleRepository implements FalTrainingLifecycleRepository {
  constructor(
    private readonly store: DataStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async claimCallback(
    requestId: string,
    fingerprint: string,
    leaseSeconds = 60,
  ): Promise<FalTrainingCallbackClaim> {
    const request = this.store.falTrainingRequests.get(requestId);
    if (!request) throw new Error("Unknown fal training request");
    const existing = this.store.falWebhookReceipts.get(fingerprint);
    const now = this.now();
    if (
      (existing && existing.status !== "processing") ||
      (existing?.status === "processing" && existing.leaseExpiresAt && existing.leaseExpiresAt > now)
    ) {
      return { claimed: false, duplicate: true, request: { ...request } };
    }
    this.store.falWebhookReceipts.set(fingerprint, {
      requestId,
      fingerprint,
      receivedAt: now,
      status: "processing",
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
    });
    return { claimed: true, duplicate: false, request: { ...request } };
  }

  async completeCallback(completion: FalTrainingCallbackCompletion): Promise<void> {
    const request = this.store.falTrainingRequests.get(completion.requestId);
    const receipt = this.store.falWebhookReceipts.get(completion.fingerprint);
    if (!request) throw new Error("Unknown fal training request");
    if (!receipt || receipt.requestId !== completion.requestId || receipt.status !== "processing") {
      throw new Error("Fal callback claim is not active");
    }
    if (request.status !== "ready" && request.status !== "failed") {
      request.status = completion.status;
      request.updatedAt = this.now();
      if (completion.status === "ready") {
        request.loraWeightKey = completion.loraWeightKey;
        request.configurationKey = completion.configurationKey;
        request.error = undefined;
      } else if (completion.status === "failed") {
        request.error = completion.error;
      }
      // Ticket 188: the Persona lifecycle moves with the fal request completion
      // (training -> review / training -> failed), mirroring the SQL transaction.
      const persona = this.store.personas.get(request.personaId);
      if (persona && persona.status === "training") {
        if (completion.status === "ready") {
          persona.status = "review";
          persona.loraWeightKey = completion.loraWeightKey ?? null;
          persona.reviewSampleKeys = completion.reviewSampleKeys ?? [];
          persona.failureReason = undefined;
        } else if (completion.status === "failed") {
          persona.status = "failed";
          persona.failureReason = completion.error;
        }
        this.store.savePersona(persona);
      }
    }
    receipt.status = "completed";
    receipt.leaseExpiresAt = undefined;
  }

  async releaseCallback(requestId: string, fingerprint: string): Promise<void> {
    const receipt = this.store.falWebhookReceipts.get(fingerprint);
    if (receipt?.requestId === requestId && receipt.status === "processing") {
      this.store.falWebhookReceipts.delete(fingerprint);
    }
  }

  async listInFlight(query: FalTrainingInFlightQuery): Promise<FalTrainingRequestRecord[]> {
    const limit = boundedLimit(query.limit);
    const pastDeadline = (request: FalTrainingRequestRecord): boolean =>
      request.createdAt.getTime() <= query.deadlineBefore.getTime();
    return [...this.store.falTrainingRequests.values()]
      .filter(
        (request) =>
          (request.status === "queued" || request.status === "running") &&
          (request.updatedAt.getTime() <= query.idleSince.getTime() || pastDeadline(request)),
      )
      // Past-deadline requests first: a bounded pass must never drop the one
      // request that is about to breach LAT-5 in favour of a merely idle one.
      .sort(
        (left, right) =>
          Number(pastDeadline(right)) - Number(pastDeadline(left)) ||
          left.updatedAt.getTime() - right.updatedAt.getTime() ||
          left.requestId.localeCompare(right.requestId),
      )
      .slice(0, limit)
      .map((request) => ({ ...request }));
  }
}

export function asFalTrainingLifecycleRepository(
  persistence: DataStore | FalTrainingLifecycleRepository,
  now: () => Date = () => new Date(),
): FalTrainingLifecycleRepository {
  return "claimCallback" in persistence
    ? persistence
    : new DataStoreFalTrainingLifecycleRepository(persistence, now);
}

function claimFromRow(row: ClaimRow | undefined): FalTrainingCallbackClaim {
  if (!row) throw new Error("Fal callback claim returned no request");
  return {
    claimed: row.claimed,
    duplicate: row.duplicate,
    request: {
      requestId: row.request_id,
      familyId: row.family_id,
      personaId: row.persona_id,
      endpoint: row.endpoint,
      model: row.model,
      steps: row.steps,
      idempotencyKey: row.idempotency_key,
      status: row.status,
      inputZipKey: row.input_zip_key ?? undefined,
      loraWeightKey: row.lora_weight_key ?? undefined,
      configurationKey: row.configuration_key ?? undefined,
      error: row.error ?? undefined,
      statusUrl: row.status_url ?? undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    },
  };
}

function recordFromRow(row: ClaimRow): FalTrainingRequestRecord {
  return claimFromRow({ ...row, claimed: false, duplicate: false }).request;
}
