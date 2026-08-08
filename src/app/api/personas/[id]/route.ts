import { NextResponse } from "next/server";
import { withBearerAuth, jsonOk, jsonError } from "@/lib/api-route";
import { personaStoryReadiness } from "@/services/persona";
import { createFalTrainingWatchdog } from "@/services/fal-training-watchdog";

/**
 * Bearer-authenticated read of one Persona's persisted training lifecycle
 * (ticket 188). Returns the durable status, likeness confirmation, the
 * Story-ready mapping, and the redacted failure reason — the production API
 * surface that reflects the state after a restart.
 *
 * Ticket 208 / FAIL-4: this is also the trigger for training reconciliation.
 * An AUTHORIZED read of a Persona still in `training` runs one watchdog pass,
 * so a training whose callback never arrived is polled from fal and driven to
 * a terminal state instead of leaving the client polling forever. The pass
 * runs after the ownership check (a cross-Family probe can never trigger it),
 * never fails the read, and reads provider state only — it cannot spend.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  return withBearerAuth(request, async (ctx, member) => {
    const found = ctx.store.getPersona(id, member.id);
    if (!found) return jsonError("Persona not found", 404);

    const watchdog =
      found.status === "training"
        ? createFalTrainingWatchdog({ persistence: ctx.store, blobs: ctx.blobs, fal: ctx.fal })
        : null;
    if (watchdog) {
      try {
        const outcomes = await watchdog.reconcile();
        if (outcomes.some((outcome) => outcome.status !== "queued")) await ctx.persist();
      } catch {
        // Reconciliation is best-effort recovery: a provider or storage fault
        // must never turn a status read into an error.
      }
    }

    const persona = ctx.store.getPersona(id, member.id) ?? found;
    const readiness = personaStoryReadiness(persona);
    // The in-flight training's bounded progress (LAT-5): elapsed, remaining,
    // and a deadline — so the client shows progress, never a bare spinner.
    const inFlight = watchdog
      ? [...ctx.store.falTrainingRequests.values()]
          .filter(
            (candidate) =>
              candidate.personaId === persona.id &&
              (candidate.status === "queued" || candidate.status === "running"),
          )
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0]
      : undefined;
    const progress = inFlight && watchdog ? watchdog.progressFor(inFlight) : undefined;
    return jsonOk({
      personaId: persona.id,
      kind: persona.kind,
      status: persona.status,
      likenessConfirmed: persona.likenessConfirmed === true,
      storyReady: readiness.storyReady,
      readinessReason: readiness.reason,
      reviewSampleCount: persona.reviewSampleKeys?.length ?? 0,
      ...(progress
        ? {
            trainingProgress: {
              elapsedMs: progress.elapsedMs,
              remainingMs: progress.remainingMs,
              budgetMs: progress.budgetMs,
              deadlineAt: progress.deadlineAt.toISOString(),
            },
          }
        : {}),
      ...(persona.failureReason ? { failureReason: persona.failureReason } : {}),
    });
  });
}
