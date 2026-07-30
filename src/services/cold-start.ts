import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Brief, PendingBrief } from "@/domain/types";
import { StorybookService } from "@/services/storybook";

const BRIEF_CLAIM_LEASE_MS = 5 * 60 * 1000;

function sanitizedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 500);
}

export class ColdStartService {
  constructor(
    private readonly store: DataStore,
    private readonly storybooks: StorybookService
  ) {}

  submitBriefWhileTraining(memberId: string, personaId: string, brief: Brief): void {
    const persona = this.store.getPersona(personaId, memberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "training" && persona.status !== "ready") {
      throw new Error("Persona not available");
    }
    const selectedPersonaIds = [...new Set(
      brief.starringPersonaIds.includes(personaId)
        ? brief.starringPersonaIds
        : [personaId, ...brief.starringPersonaIds]
    )];
    const existing = [...this.store.pendingBriefs.entries()].find(
      ([, pending]) =>
        pending.memberId === memberId &&
        JSON.stringify(pending.brief) === JSON.stringify(brief)
    );
    const key = existing?.[0] ?? `brief:${memberId}:${JSON.stringify({ ...brief, starringPersonaIds: [...selectedPersonaIds].sort() })}`;
    const previous = existing?.[1];
    // An accepted Brief is a durable pointer to the already-reserved Storybook;
    // never reset it into a second spend attempt when the submit route replays.
    if (previous?.status === "accepted" && previous.storybookId) return;
    this.store.savePendingBrief(key, {
      memberId,
      personaId,
      brief: { ...brief, starringPersonaIds: selectedPersonaIds },
      selectedPersonaIds,
      status: previous?.status === "running" ? "running" : "pending",
      claimToken: previous?.status === "running" ? previous.claimToken : undefined,
      claimExpiresAt: previous?.status === "running" ? previous.claimExpiresAt : undefined,
      submittedAt: previous?.submittedAt ?? new Date(),
    });
  }

  async onPersonaReady(personaId: string): Promise<void> {
    for (const [key, pending] of this.store.pendingBriefs) {
      const selectedPersonaIds = pending.selectedPersonaIds ?? [pending.personaId];
      if (!selectedPersonaIds.includes(personaId)) continue;
      // `accepted` is the crash-safe completion record. It is deliberately kept
      // rather than deleted so a replay can reuse the accepted Storybook ID.
      if (pending.status === "accepted" && pending.storybookId) continue;

      const now = new Date();
      const liveClaim =
        pending.status === "running" &&
        pending.claimExpiresAt !== undefined &&
        pending.claimExpiresAt.getTime() > now.getTime();
      if (liveClaim) continue;

      const allReady = selectedPersonaIds.every((selectedId) => {
        const persona = this.store.personas.get(selectedId);
        return persona?.status === "ready" && persona.likenessConfirmed === true;
      });
      if (!allReady) continue;

      // Persist the lease before requesting the Storybook. In production this
      // map is synchronized as one durable unit of work; a later worker will
      // only recover the claim after its explicit lease expires.
      const claimed: PendingBrief = {
        ...pending,
        status: "running",
        claimToken: uuid(),
        claimedAt: now,
        claimExpiresAt: new Date(now.getTime() + BRIEF_CLAIM_LEASE_MS),
        error: undefined,
      };
      this.store.savePendingBrief(key, claimed);
      try {
        // generate() durably reserves allowance and persists the Storybook
        // before enqueueing downstream provider work. Record that accepted ID
        // immediately, rather than treating asynchronous generation as done.
        const storybook = await this.storybooks.generate(claimed.memberId, claimed.brief);
        this.store.savePendingBrief(key, {
          ...claimed,
          status: "accepted",
          storybookId: storybook.id,
          acceptedAt: new Date(),
          claimToken: undefined,
          claimExpiresAt: undefined,
        });
      } catch (error) {
        // Keep the Brief visible and retryable after a provider outage. Never
        // retain a tokenized provider URL or raw error payload in durable state.
        this.store.savePendingBrief(key, {
          ...claimed,
          status: "failed",
          claimToken: undefined,
          claimExpiresAt: undefined,
          failedAt: new Date(),
          error: sanitizedError(error),
        });
        throw error;
      }
    }
  }

  trainingExpectationCopy(): string {
    return "Training takes about ~5 minutes. You can build your Brief while you wait.";
  }
}
