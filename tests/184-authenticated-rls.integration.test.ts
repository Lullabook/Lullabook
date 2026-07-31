import { describe, expect, it } from "vitest";

import { withIsolatedPostgres } from "./support/postgres/rls-harness";

describe("184 — authenticated provider artifact RLS", () => {
  it("prevents Family A from selecting, updating, or deleting Family B provider cost and control records", async () => {
    await withIsolatedPostgres(async ({ asSystem, asUser, fixture }) => {
      const costId = "00000000-0000-0000-0000-000000001840";
      const switchId = "00000000-0000-0000-0000-000000001841";
      const auditId = "00000000-0000-0000-0000-000000001842";
      await asSystem(
        `insert into provider_cost_ledger (
          id, family_id, provider, endpoint, model, pricing_version, units,
          estimated_cost_usd, actual_cost_usd, latency_ms, request_id,
          provider_request_id, owning_entity_ids, attempt_type, outcome, cost_category
        ) values (
          $1, $2, 'fal.ai', 'fal-ai/flux-2/lora', 'flux-2-lora', 'test-v1', '{}'::jsonb,
          0.1, 0.1, 10, 'request-184', 'provider-184', $3::jsonb,
          'image', 'succeeded', 'provider_attempt'
        )`,
        [costId, fixture.familyB.familyId, JSON.stringify({ familyId: fixture.familyB.familyId })],
      );
      await asSystem(
        `insert into provider_kill_switches (
          id, family_id, scope, endpoint, threshold, reason, active
        ) values ($1, $2, 'endpoint', 'fal-ai/flux-2/lora', 'red', 'test control', true)`,
        [switchId, fixture.familyB.familyId],
      );
      await asSystem(
        `insert into moderation_audit (
          id, family_id, resource_type, resource_id, outcome
        ) values ($1, $2, 'generated_image', 'book-b/page-0', 'allowed')`,
        [auditId, fixture.familyB.familyId],
      );

      expect((await asUser(
        fixture.familyA.authUserId,
        "select current_user",
      )).rows).toEqual([{ current_user: "authenticated" }]);

      for (const target of [
        { table: "provider_cost_ledger", id: costId },
        { table: "provider_kill_switches", id: switchId },
        { table: "moderation_audit", id: auditId },
      ]) {
        const selected = await asUser(
          fixture.familyA.authUserId,
          `select id from ${target.table} where id = $1`,
          [target.id],
        );
        const updated = await asUser(
          fixture.familyA.authUserId,
          `update ${target.table} set id = id where id = $1`,
          [target.id],
        );
        const deleted = await asUser(
          fixture.familyA.authUserId,
          `delete from ${target.table} where id = $1`,
          [target.id],
        );

        expect(selected.rows).toEqual([]);
        expect(updated.rowCount).toBe(0);
        expect(deleted.rowCount).toBe(0);
      }

      expect((await asSystem(
        "select id from provider_cost_ledger where id = $1",
        [costId],
      )).rows).toHaveLength(1);
      expect((await asSystem(
        "select id from provider_kill_switches where id = $1",
        [switchId],
      )).rows).toHaveLength(1);
      expect((await asSystem(
        "select id from moderation_audit where id = $1",
        [auditId],
      )).rows).toHaveLength(1);

      await asSystem("delete from families where id = $1", [fixture.familyB.familyId]);
      expect((await asSystem(
        "select id from moderation_audit where id = $1",
        [auditId],
      )).rows).toEqual([]);
    });
  }, 15_000);
});
