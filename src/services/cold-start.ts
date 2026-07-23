import type { DataStore } from "@/db/store";
import type { Brief } from "@/domain/types";
import { StorybookService } from "@/services/storybook";

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
    this.store.savePendingBrief(key, {
      memberId,
      personaId,
      brief: { ...brief, starringPersonaIds: selectedPersonaIds },
      selectedPersonaIds,
      status: existing?.[1].status === "failed" ? "pending" : existing?.[1].status ?? "pending",
      submittedAt: existing?.[1].submittedAt ?? new Date(),
    });
  }

  async onPersonaReady(personaId: string): Promise<void> {
    for (const [key, pending] of this.store.pendingBriefs) {
      const selectedPersonaIds = pending.selectedPersonaIds ?? [pending.personaId];
      if (!selectedPersonaIds.includes(personaId)) continue;
      if (pending.status === "running") continue;
      const allReady = selectedPersonaIds.every((selectedId) => {
        const persona = this.store.personas.get(selectedId);
        return persona?.status === "ready" && persona.likenessConfirmed === true;
      });
      if (!allReady) continue;

      // Claim before awaiting provider work: duplicate ready events cannot spend twice.
      pending.status = "running";
      this.store.savePendingBrief(key, pending);
      try {
        await this.storybooks.generate(pending.memberId, pending.brief);
        this.store.deletePendingBrief(key);
      } catch (error) {
        // Keep the Brief visible and retryable after a provider outage.
        pending.status = "failed";
        this.store.savePendingBrief(key, pending);
        throw error;
      }
    }
  }

  trainingExpectationCopy(): string {
    return "Training takes about ~5 minutes. You can build your Brief while you wait.";
  }
}
