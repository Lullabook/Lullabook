import type { DataStore } from "@/db/store";
import type { Moment } from "@/domain/types";

/** Hard ceiling on Moments injected into the Prompt (ADR-0019). */
export const AUTO_CONTEXT_MAX_MOMENTS = 10;

/** Rough character budget for auto-context block. */
export const AUTO_CONTEXT_CHAR_BUDGET = 1200;

export interface AutoContextSet {
  moments: Moment[];
  promptBlock: string;
}

export class AutoContextService {
  constructor(private readonly store: DataStore) {}

  buildSet(memberId: string, babyId: string): AutoContextSet {
    const baby = this.store.getBaby(babyId, memberId);
    if (!baby) throw new Error("Baby not found");

    const watermark = this.store.getAutoContextWatermark(babyId);
    const lastStoryAt = watermark?.lastStoryAt ?? null;
    const all = this.store.getMomentsForBaby(babyId, memberId);

    const significant = all.filter((m) => m.isSignificant);
    // Newest ordinary Moments win the bounded ceiling. JavaScript's stable
    // sort preserves store insertion order for identical timestamps, making
    // the tie-break deterministic without exposing another ranking pass.
    const ordinary = all
      .filter((m) => {
        if (m.isSignificant) return false;
        if (!lastStoryAt) return true;
        return m.createdAt > lastStoryAt;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let selected = [...significant, ...ordinary];
    if (selected.length > AUTO_CONTEXT_MAX_MOMENTS) {
      const sigCount = significant.length;
      const ordinaryCap = Math.max(0, AUTO_CONTEXT_MAX_MOMENTS - sigCount);
      selected = [...significant, ...ordinary.slice(0, ordinaryCap)];
    }

    let promptBlock = "";
    const lines: string[] = [];
    for (const m of selected) {
      const line = `- ${m.occurredOn}: ${m.body}${m.isSignificant ? " ✨" : ""}`;
      if (promptBlock.length + line.length > AUTO_CONTEXT_CHAR_BUDGET && m.isSignificant === false) {
        continue;
      }
      lines.push(line);
      promptBlock = lines.join("\n");
    }

    return {
      moments: selected,
      promptBlock: lines.length ? `RECENT LIFE CONTEXT (background, not the Brief):\n${lines.join("\n")}` : "",
    };
  }

  /** Advance watermark after Story text is successfully generated (issue 54). */
  advanceWatermark(babyId: string): void {
    this.store.saveAutoContextWatermark({
      babyId,
      lastStoryAt: new Date(),
    });
  }
}
