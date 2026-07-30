import { describe, expect, it } from "vitest";
import { withIsolatedPostgres } from "@/../tests/support/postgres/rls-harness";

const WATCHDOG_NOW = "2026-07-28T12:00:00.000Z";
const WATCHDOG_RETRY_NOW = "2026-07-28T13:00:00.000Z";
const STRANDED_AT = "2026-07-28T11:00:00.000Z";

describe("177 — durable exactly-once Story allowance release", () => {
  it("keeps the first watchdog release audit immutable across retry and process restart", async () => {
    await withIsolatedPostgres(async ({ asService, fixture }) => {
      const storybookId = "00000000-0000-0000-0000-000000000771";
      await asService(
        `insert into storybooks (id, family_id, created_by_member_id, status, brief, created_at)
         values ($1, $2, $3, 'generating', '{}'::jsonb, $4)`,
        [storybookId, fixture.familyA.familyId, fixture.familyA.memberId, STRANDED_AT],
      );
      await asService(
        `insert into story_allowance_reservations (storybook_id, family_id, status, created_at)
         values ($1, $2, 'reserved', $3)`,
        [storybookId, fixture.familyA.familyId, STRANDED_AT],
      );

      const first = await asService<{ storybook_id: string; allowance_released: boolean }>(
        "select * from app_reap_stranded_storybook_generations($1, $2, $3)",
        [WATCHDOG_NOW, 1_000, 10],
      );
      expect(first.rows).toHaveLength(1);
      expect(first.rows[0]).toMatchObject({ storybook_id: storybookId, allowance_released: true });

      const auditAfterFirst = await asService<{ status: string; released_at: Date; release_reason: string }>(
        "select status, released_at, release_reason from story_allowance_reservations where storybook_id = $1",
        [storybookId],
      );
      expect(auditAfterFirst.rows[0]).toMatchObject({
        status: "released",
        release_reason: "story_text_generation_failed",
      });

      const retry = await asService(
        "select * from app_reap_stranded_storybook_generations($1, $2, $3)",
        [WATCHDOG_RETRY_NOW, 1_000, 10],
      );
      expect(retry.rows).toEqual([]);
      const auditAfterRestart = await asService<{ status: string; released_at: Date; release_reason: string }>(
        "select status, released_at, release_reason from story_allowance_reservations where storybook_id = $1",
        [storybookId],
      );
      expect(auditAfterRestart.rows[0]).toEqual(auditAfterFirst.rows[0]);
    });
  });

  it("does not release committed allowance when valid Story text already exists", async () => {
    await withIsolatedPostgres(async ({ asService, fixture }) => {
      const storybookId = "00000000-0000-0000-0000-000000000772";
      await asService(
        `insert into storybooks (id, family_id, created_by_member_id, status, brief, created_at)
         values ($1, $2, $3, 'generating', '{}'::jsonb, $4)`,
        [storybookId, fixture.familyA.familyId, fixture.familyA.memberId, STRANDED_AT],
      );
      await asService(
        `insert into story_allowance_reservations (storybook_id, family_id, status, created_at)
         values ($1, $2, 'committed', $3)`,
        [storybookId, fixture.familyA.familyId, STRANDED_AT],
      );
      await asService(
        `insert into persisted_generations (storybook_id, story)
         values ($1, '{"title":"Ready","pages":[{"text":"Valid Story text"}]}'::jsonb)`,
        [storybookId],
      );

      const result = await asService<{ storybook_id: string; allowance_released: boolean }>(
        "select * from app_reap_stranded_storybook_generations($1, $2, $3)",
        [WATCHDOG_NOW, 1_000, 10],
      );
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({ storybook_id: storybookId, allowance_released: false });

      const state = await asService<{ book_status: string; allowance_status: string }>(
        `select b.status as book_status, r.status as allowance_status
         from storybooks b join story_allowance_reservations r on r.storybook_id = b.id
         where b.id = $1`,
        [storybookId],
      );
      expect(state.rows[0]).toEqual({ book_status: "draft", allowance_status: "committed" });
    });
  });
});
