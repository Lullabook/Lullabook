import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ProviderBakeoffOperation,
  ProviderBakeoffOperationRecord,
  ProviderBakeoffRepository,
  ProviderBakeoffRunRecord,
  ProviderEvidence,
} from "@/services/provider-bakeoff";

type RunRow = {
  run_id: string;
  fixture_manifest_sha256: string;
  budget_usd: number | string;
  reserved_usd: number | string;
  actual_cost_usd: number | string;
  started_at: string;
  completed_at: string | null;
};

type OperationRow = {
  run_id: string;
  operation_id: string;
  status: ProviderBakeoffOperationRecord["status"];
  reserved_usd: number | string;
  actual_cost_usd: number | string | null;
  claimed_now?: boolean;
  evidence: ProviderEvidence | null;
  error: string | null;
};

function rpcObject<T>(data: unknown, operation: string): T {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") {
    throw new Error(`${operation} returned no durable record`);
  }
  return value as T;
}

function runFromRow(row: RunRow): ProviderBakeoffRunRecord {
  return {
    runId: row.run_id,
    fixtureManifestSha256: row.fixture_manifest_sha256,
    budgetUsd: Number(row.budget_usd),
    reservedUsd: Number(row.reserved_usd),
    actualCostUsd: Number(row.actual_cost_usd),
    startedAt: new Date(row.started_at),
    ...(row.completed_at ? { completedAt: new Date(row.completed_at) } : {}),
  };
}

function operationFromRow(row: OperationRow): ProviderBakeoffOperationRecord {
  return {
    runId: row.run_id,
    operationId: row.operation_id,
    status: row.status,
    reservedUsd: Number(row.reserved_usd),
    actualCostUsd: row.actual_cost_usd === null ? null : Number(row.actual_cost_usd),
    ...(row.claimed_now === undefined ? {} : { claimedNow: row.claimed_now }),
    ...(row.evidence ? { evidence: row.evidence } : {}),
    ...(row.error ? { error: row.error } : {}),
  };
}

/** Service-role repository for the paid canary's restart-safe pre-spend claims. */
export class SupabaseProviderBakeoffRepository implements ProviderBakeoffRepository {
  constructor(private readonly client: SupabaseClient) {}

  async beginRun(
    input: Omit<ProviderBakeoffRunRecord, "reservedUsd" | "actualCostUsd">,
  ): Promise<ProviderBakeoffRunRecord> {
    const { data, error } = await this.client.rpc("app_begin_provider_bakeoff_run", {
      p_run_id: input.runId,
      p_fixture_manifest_sha256: input.fixtureManifestSha256,
      p_budget_usd: input.budgetUsd,
      p_started_at: input.startedAt.toISOString(),
    });
    if (error) throw new Error(`Begin provider bake-off run failed: ${error.message}`);
    return runFromRow(rpcObject<RunRow>(data, "Begin provider bake-off run"));
  }

  async claimOperation(
    runId: string,
    operation: ProviderBakeoffOperation,
    reservedUsd: number,
  ): Promise<ProviderBakeoffOperationRecord> {
    const { data, error } = await this.client.rpc("app_claim_provider_bakeoff_operation", {
      p_run_id: runId,
      p_operation_id: operation.operationId,
      p_provider: operation.provider,
      p_kind: operation.kind,
      p_model: operation.model,
      p_endpoint: operation.endpoint,
      p_fixture_id: operation.fixtureId,
      p_reserved_usd: reservedUsd,
    });
    if (error) throw new Error(`Claim provider bake-off operation failed: ${error.message}`);
    return operationFromRow(
      rpcObject<OperationRow>(data, "Claim provider bake-off operation"),
    );
  }

  async completeOperation(
    runId: string,
    operationId: string,
    evidence: ProviderEvidence,
  ): Promise<ProviderBakeoffOperationRecord> {
    const { data, error } = await this.client.rpc("app_complete_provider_bakeoff_operation", {
      p_run_id: runId,
      p_operation_id: operationId,
      p_status: evidence.status,
      p_actual_cost_usd: evidence.actualCostUsd ?? null,
      p_evidence: evidence,
      p_error: evidence.error ?? null,
    });
    if (error) throw new Error(`Complete provider bake-off operation failed: ${error.message}`);
    return operationFromRow(
      rpcObject<OperationRow>(data, "Complete provider bake-off operation"),
    );
  }

  async markUnknownBilling(runId: string, operationId: string, errorMessage: string): Promise<void> {
    const { error } = await this.client.rpc("app_mark_provider_bakeoff_unknown", {
      p_run_id: runId,
      p_operation_id: operationId,
      p_error: errorMessage,
    });
    if (error) throw new Error(`Mark provider bake-off billing unknown failed: ${error.message}`);
  }

  async listOperations(runId: string): Promise<ProviderBakeoffOperationRecord[]> {
    const { data, error } = await this.client
      .from("provider_bakeoff_operations")
      .select("run_id, operation_id, status, reserved_usd, actual_cost_usd, evidence, error")
      .eq("run_id", runId)
      .order("claimed_at", { ascending: true });
    if (error) throw new Error(`List provider bake-off operations failed: ${error.message}`);
    return ((data ?? []) as OperationRow[]).map(operationFromRow);
  }

  async completeRun(runId: string, completedAt: Date): Promise<void> {
    const { error } = await this.client.rpc("app_complete_provider_bakeoff_run", {
      p_run_id: runId,
      p_completed_at: completedAt.toISOString(),
    });
    if (error) throw new Error(`Complete provider bake-off run failed: ${error.message}`);
  }
}
