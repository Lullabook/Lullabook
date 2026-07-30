import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { InMemoryBlobStore } from "@/adapters/fakes";
import { SupabaseDataStore } from "@/db/supabase-store";
import { HardDeleteService } from "@/services/hard-delete";

type Row = Record<string, unknown>;

function durableClient(tables: Record<string, Row[]>): SupabaseClient {
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    let deleting = false;
    let single = false;
    const resolve = () => (tables[table] ?? []).filter((row) =>
      filters.every(([column, value]) => row[column] === value)
    );
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      maybeSingle() {
        single = true;
        return api;
      },
      delete() {
        deleting = true;
        return api;
      },
      in(column: string, ids: unknown[]) {
        if (deleting) {
          tables[table] = (tables[table] ?? []).filter((row) => !ids.includes(row[column]));
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      upsert(input: Row | Row[]) {
        const rows = Array.isArray(input) ? input : [input];
        tables[table] ??= [];
        for (const row of rows) {
          const key = row.id ?? row.family_id ?? row.storybook_id ?? row.request_id ?? row.fingerprint;
          const index = tables[table].findIndex((existing) =>
            (existing.id ?? existing.family_id ?? existing.storybook_id ?? existing.request_id ?? existing.fingerprint) === key
          );
          if (index === -1) tables[table].push({ ...row });
          else tables[table][index] = { ...tables[table][index], ...row };
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(onFulfilled: (value: { data: Row[] | Row | null; error: null }) => unknown) {
        const rows = resolve();
        return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(onFulfilled);
      },
    };
    return api;
  }
  return { from: (table: string) => query(table) } as unknown as SupabaseClient;
}

const notifications = { sendEmail: async () => undefined, sendWebPush: async () => undefined };
const now = new Date("2026-07-30T00:00:00.000Z").toISOString();

describe("184 — durable hard-delete restart", () => {
  it("returns a non-disclosing idempotent completion report after a fresh request unit of work", async () => {
    const tables: Record<string, Row[]> = {
      families: [{ id: "family-184", created_at: now }],
      members: [{
        id: "guardian-184",
        auth_user_id: "auth-guardian-184",
        family_id: "family-184",
        email: "guardian@example.test",
        role: "guardian",
        self_persona_id: null,
        jurisdiction: "US",
        created_at: now,
      }],
      provider_cost_ledger: [{
        id: "cost-184",
        family_id: "family-184",
        provider: "fal.ai",
        endpoint: "fal-ai/flux-2/lora",
        model: "flux-2-lora",
        pricing_version: "2026-07-30",
        units: { images: 1 },
        estimated_cost_usd: 0.1,
        actual_cost_usd: 0.1,
        latency_ms: 20,
        request_id: "request-184",
        provider_request_id: "provider-184",
        owning_entity_ids: { familyId: "family-184" },
        attempt_type: "image",
        outcome: "succeeded",
        cost_category: "provider_attempt",
        created_at: now,
      }],
    };
    const client = durableClient(tables);
    const blobs = new InMemoryBlobStore();
    const firstStore = new SupabaseDataStore(client);
    await firstStore.hydrateByAuthUser("auth-guardian-184");

    const first = await new HardDeleteService(firstStore, blobs, notifications).hardDelete("guardian-184");
    await firstStore.sync();
    expect(first.deleted.database.providerCostLedger).toBe(1);
    expect(tables.families).toEqual([]);
    expect(tables.members).toEqual([]);
    expect(tables.provider_cost_ledger).toEqual([]);

    const restartedStore = new SupabaseDataStore(client);
    await restartedStore.hydrateByMemberId("guardian-184");
    const repeated = await new HardDeleteService(restartedStore, blobs, notifications).hardDelete("guardian-184");

    expect(repeated).toEqual({
      familyId: "guardian-184",
      inventory: {},
      deleted: { database: {}, blobKeys: [], providerArtifacts: [] },
      provider: { limitations: [] },
    });
  });
});
