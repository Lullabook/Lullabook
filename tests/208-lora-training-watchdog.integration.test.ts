import { describe, expect, it } from "vitest";
import { InMemoryBlobStore } from "@/adapters/fakes";
import {
  PostgresFalTrainingLifecycleRepository,
  type SystemSqlRunner,
} from "@/db/fal-training-lifecycle";
import { FalTrainingWatchdogService } from "@/services/fal-training-watchdog";
import { makeTestSafetensorsArtifact } from "./support/fal-training-artifacts";
import { withIsolatedPostgres } from "./support/postgres/rls-harness";

/**
 * Ticket 208 / FAIL-4 — the PRODUCTION find seam, against real Postgres.
 *
 * tests/208-lora-training-watchdog.test.ts proves the watchdog's behaviour over
 * the in-memory repository. This file proves the durable half the live run
 * actually depends on: migration 028's `status_url` column plus
 * `app_list_stale_fal_training_requests`, and that a reconciliation driven
 * through the Postgres repository really terminalizes the request and its
 * Persona inside the same lifecycle transaction the signed callback uses.
 */
const ENDPOINT = "fal-ai/flux-2-trainer-v2";
const MINUTE = 60_000;

async function seed(
  asSystem: (text: string, values?: unknown[]) => Promise<unknown>,
  familyId: string,
  personaId: string,
  requestId: string,
  options: { status?: string; ageMinutes: number },
): Promise<void> {
  await asSystem(
    `insert into fal_training_requests (
       request_id, family_id, persona_id, endpoint, model, steps,
       idempotency_key, status, status_url, created_at, updated_at
     ) values ($1, $2, $3, $4, 'flux-2-lora-v2', 300, $5, $6, $7,
       now() - make_interval(mins => $8::int), now() - make_interval(mins => $8::int))`,
    [
      requestId,
      familyId,
      personaId,
      ENDPOINT,
      `watchdog:${requestId}`,
      options.status ?? "queued",
      `https://queue.fal.run/${ENDPOINT}/requests/${requestId}/status`,
      options.ageMinutes,
    ],
  );
}

describe("208 — watchdog reconciliation over the Postgres lifecycle repository", () => {
  it("lists only stale in-flight requests and drives one to a durable terminal state", async () => {
    await withIsolatedPostgres(async ({ asSystem, fixture }) => {
      const { familyId, personaId } = fixture.familyA;
      await asSystem("update personas set status = 'training' where id = $1", [personaId]);
      await seed(asSystem, familyId, personaId, "stale-request", { ageMinutes: 30 });
      await seed(asSystem, familyId, personaId, "fresh-request", { ageMinutes: 0 });
      await seed(asSystem, familyId, personaId, "done-request", { ageMinutes: 30, status: "ready" });

      const repository = new PostgresFalTrainingLifecycleRepository(
        (async (text: string, values?: unknown[]) => asSystem(text, values)) as SystemSqlRunner,
      );

      const stale = await repository.listInFlight({
        idleSince: new Date(Date.now() - 5 * MINUTE),
        deadlineBefore: new Date(Date.now() - 25 * MINUTE),
      });
      // Only the silent, in-flight request qualifies — never a fresh one and
      // never one a callback already terminalized.
      expect(stale.map((request) => request.requestId)).toEqual(["stale-request"]);
      expect(stale[0]!.statusUrl).toBe(
        `https://queue.fal.run/${ENDPOINT}/requests/stale-request/status`,
      );

      // LAT-5 arm: a request heart-beaten a moment ago is NOT idle, but it is
      // past its budget, so the same SQL function still returns it.
      await seed(asSystem, familyId, personaId, "heartbeat-request", {
        ageMinutes: 30,
        status: "running",
      });
      await asSystem("update fal_training_requests set updated_at = now() where request_id = $1", [
        "heartbeat-request",
      ]);
      const overdue = await repository.listInFlight({
        idleSince: new Date(Date.now() - 5 * MINUTE),
        deadlineBefore: new Date(Date.now() - 25 * MINUTE),
      });
      expect(overdue.map((request) => request.requestId)).toContain("heartbeat-request");
      // Past-deadline requests are ordered first inside a bounded pass.
      const bounded = await repository.listInFlight({
        idleSince: new Date(Date.now() - 5 * MINUTE),
        deadlineBefore: new Date(Date.now() - 25 * MINUTE),
        limit: 2,
      });
      expect(bounded).toHaveLength(2);
      await asSystem("delete from fal_training_requests where request_id = $1", [
        "heartbeat-request",
      ]);

      const watchdog = new FalTrainingWatchdogService(
        repository,
        new InMemoryBlobStore(),
        async () => ({
          requestId: "stale-request",
          status: "ERROR",
          error: "fal.ai trainer crashed api_key=super-secret",
        }),
        async (url) => ({
          bytes: makeTestSafetensorsArtifact(),
          contentType: "application/octet-stream",
          finalUrl: url,
        }),
        () => new Date(),
        { pollAfterMs: 5 * MINUTE },
      );

      const [outcome] = await watchdog.reconcile();
      expect(outcome).toMatchObject({
        requestId: "stale-request",
        action: "advanced_failed",
        status: "failed",
      });

      const request = (await asSystem(
        "select status, error from fal_training_requests where request_id = 'stale-request'",
      )) as { rows: { status: string; error: string }[] };
      expect(request.rows[0]!.status).toBe("failed");
      expect(request.rows[0]!.error).toContain("trainer crashed");
      expect(request.rows[0]!.error).not.toContain("super-secret");

      const persona = (await asSystem("select status, failure_reason from personas where id = $1", [
        personaId,
      ])) as { rows: { status: string; failure_reason: string }[] };
      expect(persona.rows[0]!.status).toBe("failed");
      expect(persona.rows[0]!.failure_reason).toContain("trainer crashed");

      // Nothing is left in flight, and a second pass finds nothing to do.
      expect(
        await repository.listInFlight({
          idleSince: new Date(Date.now() - 5 * MINUTE),
          deadlineBefore: new Date(Date.now() - 25 * MINUTE),
        }),
      ).toEqual([]);
      expect(await watchdog.reconcile()).toEqual([]);
    });
  });
});
