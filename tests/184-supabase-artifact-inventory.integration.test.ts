import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseDataStore } from "@/db/supabase-store";

type Row = Record<string, unknown>;

/** A mutable Supabase boundary double: sync writes change the next hydration. */
function durableClient(tables: Record<string, Row[]>): SupabaseClient {
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    let deleting = false;
    const rows = () => (tables[table] ?? []).filter((row) =>
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
        return api;
      },
      delete() {
        deleting = true;
        return api;
      },
      in(column: string, values: unknown[]) {
        if (deleting) {
          tables[table] = (tables[table] ?? []).filter((row) => !values.includes(row[column]));
          return Promise.resolve({ data: null, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      upsert(input: Row | Row[]) {
        const inputRows = Array.isArray(input) ? input : [input];
        tables[table] ??= [];
        for (const row of inputRows) {
          const key = row.id ?? row.family_id ?? row.storybook_id ?? row.request_id ?? row.fingerprint;
          const index = tables[table].findIndex((existing) =>
            (existing.id ?? existing.family_id ?? existing.storybook_id ?? existing.request_id ?? existing.fingerprint) === key
          );
          if (index < 0) tables[table].push({ ...row });
          else tables[table][index] = { ...tables[table][index], ...row };
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: rows(), error: null }).then(onFulfilled);
      },
    };
    return api;
  }
  return { from: (table: string) => query(table) } as unknown as SupabaseClient;
}

const now = new Date("2026-07-30T00:00:00.000Z").toISOString();

function costRow(id: string, familyId: string): Row {
  return {
    id,
    family_id: familyId,
    provider: "fal.ai",
    endpoint: "fal-ai/flux-2/lora",
    model: "flux-2-lora",
    pricing_version: "2026-07-30",
    units: { images: 1 },
    estimated_cost_usd: 0.1,
    actual_cost_usd: 0.1,
    latency_ms: 20,
    request_id: `request-${id}`,
    provider_request_id: `provider-${id}`,
    owning_entity_ids: { familyId },
    attempt_type: "image",
    outcome: "succeeded",
    cost_category: "provider_attempt",
    created_at: now,
  };
}

function switchRow(id: string, familyId: string): Row {
  return {
    id,
    family_id: familyId,
    scope: "endpoint",
    endpoint: "fal-ai/flux-2/lora",
    threshold: "red",
    reason: "test control",
    active: true,
    created_at: now,
  };
}

describe("184 — Supabase provider artifact inventory", () => {
  it("hydrates scoped financial controls and durably removes only the hard-deleted Family's rows", async () => {
    const tables: Record<string, Row[]> = {
      families: [
        { id: "family-a", created_at: now },
        { id: "family-b", created_at: now },
      ],
      provider_cost_ledger: [costRow("cost-a", "family-a"), costRow("cost-b", "family-b")],
      provider_kill_switches: [switchRow("switch-a", "family-a"), switchRow("switch-b", "family-b")],
    };
    const store = new SupabaseDataStore(durableClient(tables));

    await store.hydrateFamily("family-a");
    expect([...store.providerCostLedgerEntries.keys()]).toEqual(["cost-a"]);
    expect([...store.providerKillSwitches.keys()]).toEqual(["switch-a"]);

    store.hardDeleteFamily("family-a");
    await store.sync();

    expect(tables.provider_cost_ledger.map((row) => row.id)).toEqual(["cost-b"]);
    expect(tables.provider_kill_switches.map((row) => row.id)).toEqual(["switch-b"]);

    const restarted = new SupabaseDataStore(durableClient(tables));
    await restarted.hydrateFamily("family-b");
    expect([...restarted.providerCostLedgerEntries.keys()]).toEqual(["cost-b"]);
    expect([...restarted.providerKillSwitches.keys()]).toEqual(["switch-b"]);
  });
});
