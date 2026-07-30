import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SupabaseDataStore } from "@/db/supabase-store";
import {
  CostThreshold,
  ProviderCostMeteringService,
  SpendBlockedError,
} from "@/services/provider-cost-metering";

type Row = Record<string, unknown>;

function durableClient(tables: Record<string, Row[]>): SupabaseClient {
  function query(table: string) {
    const filters: Array<[string, unknown]> = [];
    let deleteMode = false;
    const resolve = () =>
      (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
    const api = {
      select() {
        return api;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return api;
      },
      in() {
        return Promise.resolve({ data: null, error: null });
      },
      delete() {
        deleteMode = true;
        return api;
      },
      upsert(input: Row | Row[]) {
        if (deleteMode) return Promise.resolve({ data: null, error: null });
        const rows = Array.isArray(input) ? input : [input];
        tables[table] ??= [];
        for (const row of rows) {
          const index = tables[table].findIndex((existing) => existing.id === row.id);
          if (index === -1) tables[table].push({ ...row });
          else tables[table][index] = { ...tables[table][index], ...row };
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(onFulfilled: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: resolve(), error: null }).then(onFulfilled);
      },
    };
    return api;
  }
  return { from: (table: string) => query(table) } as unknown as SupabaseClient;
}

describe("183 — durable kill-switch restart", () => {
  it("rehydrates a Family-scoped red switch and blocks spend after a process restart", async () => {
    const now = new Date().toISOString();
    const tables: Record<string, Row[]> = {
      families: [{ id: "family-183", created_at: now }],
      members: [],
      provider_cost_ledger: [],
      provider_kill_switches: [],
    };
    const client = durableClient(tables);
    const firstStore = new SupabaseDataStore(client);
    await firstStore.hydrateFamily("family-183");
    const firstMeter = new ProviderCostMeteringService(firstStore);
    firstMeter.setKillSwitch({
      familyId: "family-183",
      scope: "endpoint",
      endpoint: "fal-ai/flux-2/lora",
      threshold: CostThreshold.RED,
      reason: "margin floor breached",
    });
    await firstStore.sync();

    const restartedStore = new SupabaseDataStore(client);
    await restartedStore.hydrateFamily("family-183");
    const restartedMeter = new ProviderCostMeteringService(restartedStore);

    expect(restartedMeter.getKillSwitches()).toHaveLength(1);
    expect(() =>
      restartedMeter.assertSpendAllowed({
        familyId: "family-183",
        provider: "fal.ai",
        model: "flux-2-lora",
        endpoint: "fal-ai/flux-2/lora",
      })
    ).toThrow(SpendBlockedError);
    expect(restartedMeter.getControls()).toEqual({
      canCreateSpend: false,
      canHardDelete: true,
      canViewDrafts: true,
    });
  });
});
