import { v4 as uuid, v5 as uuidv5 } from "uuid";
import type { DataStore } from "@/db/store";
import type { Brief, PendingBrief } from "@/domain/types";
import { StorybookService } from "@/services/storybook";

const BRIEF_CLAIM_LEASE_MS = 5 * 60 * 1000;
const BRIEF_STORYBOOK_ID_NAMESPACE = "5c4f0e2e-6c86-4be7-9bc2-4de88b6f6de7";

interface ColdStartDurability {
  /** Persist map mutations without dispatching buffered workflow events. */
  persist: () => Promise<void>;
  /** Obtain durable downstream acceptance for buffered workflow events. */
  dispatch: () => Promise<void>;
}

function sanitizedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/https?:\/\/\S+/g, "[redacted-url]").slice(0, 500);
}

function selectedPersonaIds(pending: PendingBrief): string[] {
  return pending.selectedPersonaIds && pending.selectedPersonaIds.length > 0
    ? pending.selectedPersonaIds
    : [pending.personaId];
}

export class ColdStartService {
  constructor(
    private readonly store: DataStore,
    private readonly storybooks: StorybookService,
    private readonly durability?: ColdStartDurability
  ) {}

  submitBriefWhileTraining(memberId: string, personaId: string, brief: Brief): void {
    const persona = this.store.getPersona(personaId, memberId);
    if (!persona) throw new Error("Persona not found");
    if (persona.status !== "training" && persona.status !== "ready") {
      throw new Error("Persona not available");
    }
    const selected = [...new Set(
      brief.starringPersonaIds.includes(personaId)
        ? brief.starringPersonaIds
        : [personaId, ...brief.starringPersonaIds]
    )];
    for (const selectedId of selected) {
      if (!this.store.getPersona(selectedId, memberId)) {
        throw new Error("Selected Persona is not available in this Family");
      }
    }
    const normalizedBrief = { ...brief, starringPersonaIds: selected };
    const key = `brief:${memberId}:${JSON.stringify({
      ...normalizedBrief,
      starringPersonaIds: [...selected].sort(),
    })}`;
    const previous = this.store.getPendingBrief(key);
    // An accepted Brief is a durable pointer to the already-reserved Storybook;
    // never reset it into a second spend attempt when the submit route replays.
    if (previous?.status === "accepted" && previous.storybookId) return;
    this.store.savePendingBrief(key, {
      memberId,
      personaId,
      brief: normalizedBrief,
      selectedPersonaIds: selected,
      status: previous?.status === "running" ? "running" : "pending",
      claimToken: previous?.status === "running" ? previous.claimToken : undefined,
      claimExpiresAt: previous?.status === "running" ? previous.claimExpiresAt : undefined,
      claimedAt: previous?.status === "running" ? previous.claimedAt : undefined,
      storybookId: previous?.storybookId,
      submittedAt: previous?.submittedAt ?? new Date(),
    });
  }

  async onPersonaReady(personaId: string): Promise<void> {
    for (const [key, current] of [...this.store.pendingBriefs.entries()]) {
      const requiredPersonaIds = selectedPersonaIds(current);
      if (!requiredPersonaIds.includes(personaId)) continue;
      if (current.status === "accepted" && current.storybookId) continue;

      const allReady = requiredPersonaIds.every((selectedId) => {
        try {
          const persona = this.store.getPersona(selectedId, current.memberId);
          return persona?.status === "ready" && persona.likenessConfirmed === true;
        } catch {
          return false;
        }
      });
      if (!allReady) continue;

      const now = new Date();
      const claimToken = uuid();
      const claim = await this.store.claimPendingBrief(
        key,
        claimToken,
        now,
        new Date(now.getTime() + BRIEF_CLAIM_LEASE_MS)
      );
      if (!claim.claimedNow) continue;

      let claimed: PendingBrief = {
        ...claim.pending,
        selectedPersonaIds: requiredPersonaIds,
      };
      let storybookId =
        claimed.storybookId ?? uuidv5(key, BRIEF_STORYBOOK_ID_NAMESPACE);
      try {
        const existingStorybook = this.store.storybooks.get(storybookId);
        if (existingStorybook) {
          // Enforce the actor/Family boundary before reusing a crash-left row.
          this.store.getStorybook(storybookId, claimed.memberId);
        } else {
          const storybook = await this.storybooks.generate(claimed.memberId, claimed.brief, {
            storybookId,
            deferEnqueue: true,
          });
          storybookId = storybook.id;
        }

        claimed = {
          ...claimed,
          status: "running",
          storybookId,
          error: undefined,
          failedAt: undefined,
        };
        this.store.savePendingBrief(key, claimed);

        if (this.durability) {
          // Commit the claim, allowance reservation, Storybook, and retry pointer
          // before asking the queue to accept provider work.
          await this.durability.persist();
        }
        this.storybooks.enqueueGeneration(claimed.memberId, storybookId);
        if (this.durability) await this.durability.dispatch();

        this.store.savePendingBrief(key, {
          ...claimed,
          status: "accepted",
          storybookId,
          acceptedAt: new Date(),
          claimToken: undefined,
          claimExpiresAt: undefined,
        });
        if (this.durability) await this.durability.persist();
      } catch (error) {
        // Preserve the same Storybook pointer when dispatch fails. A later claim
        // re-dispatches that stable ID instead of reserving allowance again.
        this.store.savePendingBrief(key, {
          ...claimed,
          status: "failed",
          storybookId,
          claimToken: undefined,
          claimExpiresAt: undefined,
          failedAt: new Date(),
          error: sanitizedError(error),
        });
        if (this.durability) {
          try {
            await this.durability.persist();
          } catch {
            // Keep the original provider/queue failure as the caller-visible error.
          }
        }
        throw error;
      }
    }
  }

  trainingExpectationCopy(): string {
    return "Training takes about ~5 minutes. You can build your Brief while you wait.";
  }
}
