import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { BabyPastStorySummary, Storybook } from "@/domain/types";
import type { PastStorySummaryProvider } from "@/services/context-selector";

/**
 * Past-Story continuity summary (issue 90 / ADR-0022).
 *
 * On Storybook **finalization**, produces and stores a bounded summary of the
 * Story (theme + cast + a truncated beats excerpt) for a Baby. The context
 * engine (issue 89) consumes a rolling window of the newest-N summaries as its
 * continuity / anti-repeat input — so generation doesn't retell the same plot.
 *
 * Deterministic (no extra LLM call): the summary is assembled from data already
 * persisted on the Storybook (brief theme, starring personas, the generated
 * Story text excerpt). Family-scoped (RLS), carries no raw photo data, and is
 * purged by hard-delete (ADR-0007).
 */

/** Per-summary character bound (~150 tokens). */
export const PAST_STORY_SUMMARY_MAX_CHARS = 600;
/** Rolling window: the newest-N finalized Stories feed the anti-repeat input. */
export const PAST_STORY_ROLLING_WINDOW = 5;
/** Bound on the combined rolling summary handed to the engine (~300 tokens). */
export const ROLLING_SUMMARY_MAX_CHARS = 1200;

/** Excerpt of the generated Story text kept as the "beats" surrogate. */
const BEATS_EXCERPT_CHARS = 280;

export class PastStorySummaryService {
  constructor(private readonly store: DataStore) {}

  /**
   * Produce + persist a bounded summary on finalization. Returns the record,
   * or `undefined` when the Storybook carries no Baby (only per-Baby Stories
   * get a summary — the rolling window is per-Baby).
   */
  recordFinalization(
    actorMemberId: string,
    storybookId: string
  ): BabyPastStorySummary | undefined {
    const book = this.store.getStorybook(storybookId, actorMemberId);
    if (!book) throw new Error("Storybook not found");
    if (!book.babyId) return undefined;

    const summary = this.summarize(book, actorMemberId);
    const record: BabyPastStorySummary = {
      id: uuid(),
      familyId: book.familyId,
      babyId: book.babyId,
      storybookId,
      summary,
      createdAt: new Date(),
    };
    this.store.saveBabyPastStorySummary(record);
    return record;
  }

  private summarize(book: Storybook, actorMemberId: string): string {
    const theme = book.brief.theme;

    const cast = book.brief.starringPersonaIds
      .map((id) => this.store.getPersona(id, actorMemberId)?.displayName)
      .filter((name): name is string => Boolean(name))
      .join(", ");

    const persisted = this.store.getPersistedGeneration(book.id);
    const beats = persisted?.story.text ?? "";
    const excerpt = beats.slice(0, BEATS_EXCERPT_CHARS).trim();

    let summary = `Theme: ${theme}.`;
    if (cast) summary += ` Cast: ${cast}.`;
    if (excerpt) summary += ` ${excerpt}`;
    return summary.slice(0, PAST_STORY_SUMMARY_MAX_CHARS);
  }

  /**
   * The rolling continuity/anti-repeat summary for a Baby: the newest-N
   * finalized Stories, concatenated and bounded. Returns `undefined` when no
   * prior Stories exist (the engine then degrades — no anti-repeat section).
   */
  getRollingSummary(
    actorMemberId: string,
    babyId: string
  ): string | undefined {
    const baby = this.store.getBaby(babyId, actorMemberId);
    if (!baby) throw new Error("Baby not found");

    const all = this.store.getBabyPastStorySummaries(babyId, actorMemberId);
    const window = all.slice(0, PAST_STORY_ROLLING_WINDOW);
    if (window.length === 0) return undefined;

    const combined = window.map((w) => w.summary).join(" | ");
    return combined.slice(0, ROLLING_SUMMARY_MAX_CHARS);
  }
}

/**
 * Adapter that exposes the rolling summary to the Story Context Engine (issue
 * 89) as its {@link PastStorySummaryProvider} seam.
 */
export function pastStorySummaryProvider(
  service: PastStorySummaryService
): PastStorySummaryProvider {
  return {
    getSummary: (actorMemberId, babyId) =>
      service.getRollingSummary(actorMemberId, babyId),
  };
}

// Re-export the provider type for callers that wire the selector directly.
export type { PastStorySummaryProvider };