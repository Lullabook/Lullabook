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
    this.store.savePendingBrief(`${memberId}:${personaId}`, {
      memberId,
      personaId,
      brief,
      submittedAt: new Date(),
    });
  }

  async onPersonaReady(personaId: string): Promise<void> {
    for (const [key, pending] of this.store.pendingBriefs) {
      if (pending.personaId === personaId) {
        await this.storybooks.generate(pending.memberId, pending.brief);
        this.store.deletePendingBrief(key);
      }
    }
  }

  trainingExpectationCopy(): string {
    return "Training takes about ~5 minutes. You can build your Brief while you wait.";
  }
}
