import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthenticatedSqlRunner, SqlResult } from "@/db/persona-creation-protocol";

/** Persisted Persona training-lifecycle state (ticket 188). */
export interface PersonaTrainingLifecycleRow {
  personaId: string;
  status: "training" | "review" | "ready" | "failed";
  likenessConfirmed: boolean;
  /** Persisted Story-ready mapping: ready AND likeness-confirmed only. */
  storyReady: boolean;
  loraWeightKey: string | null;
  reviewSampleKeys: string[];
  failureReason: string | null;
}

export interface PersonaTrainingLifecycleRepository {
  /** Durable, authenticated `review -> training` retrain (subject/Guardian enforced in SQL). */
  transitionReviewToTraining(personaId: string): Promise<PersonaTrainingLifecycleRow>;
  /** Authenticated read of the persisted lifecycle for the production API. */
  readPersona(personaId: string): Promise<PersonaTrainingLifecycleRow | null>;
}

interface LifecycleRow extends Record<string, unknown> {
  persona_id: string;
  status: PersonaTrainingLifecycleRow["status"];
  likeness_confirmed: boolean;
  story_ready: boolean;
  lora_weight_key: string | null;
  review_sample_keys: unknown;
  failure_reason: string | null;
}

/** PostgreSQL adapter over the authenticated SQL runner used by the harness. */
export class PostgresPersonaTrainingLifecycleRepository implements PersonaTrainingLifecycleRepository {
  constructor(
    private readonly queryAsUser: AuthenticatedSqlRunner,
    private readonly authUserId: string,
  ) {}

  async transitionReviewToTraining(personaId: string): Promise<PersonaTrainingLifecycleRow> {
    const result = await this.queryAsUser<LifecycleRow>(
      this.authUserId,
      "select * from app_transition_persona_review_training($1::uuid)",
      [personaId],
    );
    return toLifecycleRow(requiredRow(result.rows[0], "Persona retrain transition was not returned"));
  }

  async readPersona(personaId: string): Promise<PersonaTrainingLifecycleRow | null> {
    const result = await this.queryAsUser<LifecycleRow>(
      this.authUserId,
      "select * from app_read_persona_training_lifecycle($1::uuid)",
      [personaId],
    );
    return result.rows[0] ? toLifecycleRow(result.rows[0]) : null;
  }
}

/** Server-side Supabase adapter bound to the authenticated bearer client. */
export class SupabasePersonaTrainingLifecycleRepository implements PersonaTrainingLifecycleRepository {
  constructor(private readonly client: SupabaseClient) {}

  async transitionReviewToTraining(personaId: string): Promise<PersonaTrainingLifecycleRow> {
    const rows = await runRpc<LifecycleRow>(this.client, "app_transition_persona_review_training", {
      p_persona_id: personaId,
    });
    return toLifecycleRow(requiredRow(rows[0], "Persona retrain transition was not returned"));
  }

  async readPersona(personaId: string): Promise<PersonaTrainingLifecycleRow | null> {
    const rows = await runRpc<LifecycleRow>(this.client, "app_read_persona_training_lifecycle", {
      p_persona_id: personaId,
    });
    return rows[0] ? toLifecycleRow(rows[0]) : null;
  }
}

async function runRpc<Row extends Record<string, unknown>>(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Row[]> {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}

function toLifecycleRow(row: LifecycleRow): PersonaTrainingLifecycleRow {
  return {
    personaId: row.persona_id,
    status: row.status,
    likenessConfirmed: row.likeness_confirmed,
    storyReady: row.story_ready,
    loraWeightKey: row.lora_weight_key,
    reviewSampleKeys: Array.isArray(row.review_sample_keys)
      ? row.review_sample_keys.filter((key): key is string => typeof key === "string")
      : [],
    failureReason: row.failure_reason,
  };
}

function requiredRow<Row>(row: Row | undefined, message: string): Row {
  if (!row) throw new Error(message);
  return row;
}

export type { SqlResult };
