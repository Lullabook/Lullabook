import type { DataStore } from "@/db/store";
import type { Moment, Persona } from "@/domain/types";
import { AutoContextService } from "@/services/auto-context";

/**
 * Story Context Engine — deterministic selector (ADR-0022).
 *
 * Generalizes the ADR-0019 Moments auto-context layer: Moments become one input
 * among many (roster cast, age/Firsts, a past-Story continuity summary, and
 * moment-photo vision→text). Assembly is pure DB reads + concatenation — no
 * extra LLM call — so it adds negligible latency and is fully unit-testable.
 *
 * A typed {@link ContextSelector} seam is left so a later LLM-ranking pass (v2)
 * can replace the rule-based selector without changing the Prompt builder
 * contract.
 */

/**
 * Soft token ceiling for the assembled context block (~2000 context tokens).
 *
 * Soft, not hard: cast, the past-Story summary, and significant Moments are
 * PROTECTED (never trimmed), so a Household whose protected content alone
 * exceeds this budget can overshoot it. Ordinary Moments, vision-text, and
 * Firsts are the droppable budget levers. The tilde in the ADR's "≤ ~2000"
 * reflects this — the cap is a target, enforced over the droppable inputs.
 */
export const STORY_CONTEXT_TOKEN_BUDGET = 2000;

/** A member of the cast assembled for a Baby's Story. */
export interface CastMember {
  personaId: string;
  displayName: string;
  /** `protagonist` = the Baby; `cast` = a starring adult. */
  role: "protagonist" | "cast";
  relationship?: string;
  /** What the Baby calls this person (e.g. "Mama"). */
  babyCallsThem?: string;
  /** What this person calls the Baby (e.g. "my little star"). */
  theyCallBaby?: string;
}

/** The bounded story context set handed to the Prompt builder. */
export interface StoryContextSet {
  /** Significant Moments (always) + ordinary Moments since the last Story. */
  moments: Moment[];
  /** Starring personas + their bonds to this Baby. */
  cast: CastMember[];
  /** Birthdate-derived age summary, when a birthDate is set. */
  ageSummary?: string;
  /** Firsts/milestone Moment bodies surfaced as an explicit section. */
  firsts: string[];
  /** Rolling continuity/anti-repeat summary of recent finalized Stories (issue 90). */
  pastStorySummary?: string;
  /** Write-only vision→text descriptions of linked Moment photos (ADR-0021). */
  visionText: string[];
  /** The assembled, token-bounded block injected into the Prompt as background. */
  promptBlock: string;
  /** Rough token estimate of {@link promptBlock} (chars / 4). */
  tokenEstimate: number;
  /** IDs and bounded source counts retained for Story provenance. */
  sourceManifest: StoryContextSourceManifest;
}

/**
 * Family-scoped provenance for a selected context set. This is deliberately an
 * ID manifest, not a copy of source content: raw photos and lifetime
 * transcripts must never be persisted on a Story.
 */
export interface StoryContextSourceManifest {
  familyId: string;
  babyId: string;
  personaIds: string[];
  momentIds: string[];
  firstCount: number;
  pastStorySummaryIncluded: boolean;
  photoDescriptionCount: number;
  tokenEstimate: number;
}

/** Seam: supplies the rolling past-Story summary (issue 90). Default = none. */
export interface PastStorySummaryProvider {
  getSummary(actorMemberId: string, babyId: string): string | undefined;
}

/** Seam: supplies write-only vision→text for a Baby's Moment photos (ADR-0021). */
export interface VisionTextProvider {
  getVisionText(actorMemberId: string, babyId: string): string[];
}

/** The selector contract — a v2 LLM-ranking selector can implement this unchanged. */
export interface ContextSelector {
  selectForBaby(
    actorMemberId: string,
    babyId: string,
    starringPersonaIds: string[]
  ): Promise<StoryContextSet>;
}

/** No-op past-Story summary provider (the default until issue 90 lands). */
export const NO_PAST_STORY_SUMMARY: PastStorySummaryProvider = {
  getSummary: () => undefined,
};

/** No-op vision-text provider (the default until ADR-0021 storage lands). */
export const NO_VISION_TEXT: VisionTextProvider = {
  getVisionText: () => [],
};

/** Rough token estimate: ~4 chars/token is the standard conservative ratio. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Derive a human age summary from a YYYY-MM-DD birthDate relative to `now`. */
export function deriveAgeSummary(birthDate: string, now: Date): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return undefined;
  const birth = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return undefined;

  let months =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) months -= 1;
  if (months < 0) months = 0;

  if (months < 24) return `${months} month${months === 1 ? "" : "s"} old`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} old`;
}

interface RenderedMoments {
  significant: string[];
  ordinary: string[];
}

function renderMoments(moments: Moment[]): RenderedMoments {
  const significant: string[] = [];
  const ordinary: string[] = [];
  // `moments` arrives already selected by AutoContextService (significant always
  // + ordinary since the watermark, newest-N). Preserve that ordering while we
  // split for trim-priority: significant lines are protected, ordinary droppable.
  for (const m of moments) {
    const line = `- ${m.occurredOn}: ${m.body}${m.isSignificant ? " ✨" : ""}`;
    if (m.isSignificant) significant.push(line);
    else ordinary.push(line);
  }
  return { significant, ordinary };
}

function renderCast(cast: CastMember[]): string[] {
  return cast.map((c) => {
    if (c.role === "protagonist") return `- ${c.displayName} — the baby (protagonist)`;
    const rel = c.relationship ? `${c.relationship}` : "family";
    const calls = c.babyCallsThem ? ` (baby calls them "${c.babyCallsThem}")` : "";
    return `- ${c.displayName} — ${rel}${calls}`;
  });
}

/**
 * Rule-based selector. Composes {@link AutoContextService} for the ADR-0019
 * Moments rule (significant always, ordinary since the last Story, watermark),
 * then layers roster cast, age/Firsts, a past-Story summary, and photo
 * vision→text on top, bounding the whole to {@link STORY_CONTEXT_TOKEN_BUDGET}.
 */
export class StoryContextSelector implements ContextSelector {
  constructor(
    private readonly store: DataStore,
    private readonly autoContext: AutoContextService,
    private readonly pastStorySummary: PastStorySummaryProvider = NO_PAST_STORY_SUMMARY,
    private readonly visionText: VisionTextProvider = NO_VISION_TEXT,
    private readonly now: () => Date = () => new Date()
  ) {}

  async selectForBaby(
    actorMemberId: string,
    babyId: string,
    starringPersonaIds: string[]
  ): Promise<StoryContextSet> {
    // RLS gate: getBaby returns undefined for another family's baby.
    const baby = this.store.getBaby(babyId, actorMemberId);
    if (!baby) throw new Error("Baby not found");

    // Moments (ADR-0019 contract) — significant always + ordinary since watermark.
    // A malformed Moment (bad occurredOn) is skipped, not fatal (ADR-0022).
    const momentSet = this.autoContext.buildSet(actorMemberId, babyId);
    const moments = momentSet.moments.filter((m) =>
      /^\d{4}-\d{2}-\d{2}$/.test(m.occurredOn)
    );

    // Cast: starring personas + their bonds to this Baby. Never crosses Babies —
    // bonds are scoped to babyId, personas to the actor's family.
    const bonds = this.store.getBondsForBaby(babyId, actorMemberId);
    const bondByPersona = new Map(bonds.map((b) => [b.personaId, b]));
    const cast: CastMember[] = starringPersonaIds
      .map((id) => this.store.getPersona(id, actorMemberId))
      .filter((p): p is Persona => !!p)
      .map((p) => {
        const bond = bondByPersona.get(p.id);
        if (p.kind === "baby") {
          return {
            personaId: p.id,
            displayName: p.displayName,
            role: "protagonist" as const,
          };
        }
        return {
          personaId: p.id,
          displayName: p.displayName,
          role: "cast" as const,
          relationship: bond?.relationship || undefined,
          babyCallsThem: bond?.babyCallsThem || undefined,
          theyCallBaby: bond?.theyCallBaby || undefined,
        };
      });

    const ageSummary = baby.birthDate
      ? deriveAgeSummary(baby.birthDate, this.now())
      : undefined;

    // Firsts: milestone/first Moments (already in the selected set).
    const firsts = moments
      .filter((m) => m.momentType === "first" || m.momentType === "milestone")
      .map((m) => m.body);

    // Seams (issue 90 / ADR-0021) — degrade to empty when absent.
    const pastStorySummary = this.pastStorySummary.getSummary(actorMemberId, babyId);
    const visionText = this.visionText.getVisionText(actorMemberId, babyId);

    const promptBlock = this.assemble({
      cast,
      ageSummary,
      firsts,
      pastStorySummary,
      visionText,
      moments,
    });

    return {
      moments,
      cast,
      ageSummary,
      firsts,
      pastStorySummary,
      visionText,
      promptBlock,
      tokenEstimate: estimateTokens(promptBlock),
      sourceManifest: {
        familyId: baby.familyId,
        babyId,
        personaIds: cast.map((member) => member.personaId),
        momentIds: moments.map((moment) => moment.id),
        firstCount: firsts.length,
        pastStorySummaryIncluded: Boolean(pastStorySummary),
        photoDescriptionCount: visionText.length,
        tokenEstimate: estimateTokens(promptBlock),
      },
    };
  }

  private assemble(input: {
    cast: CastMember[];
    ageSummary?: string;
    firsts: string[];
    pastStorySummary?: string;
    visionText: string[];
    moments: Moment[];
  }): string {
    const sections: string[] = [];

    // CAST — protected.
    const castLines = renderCast(input.cast);
    if (castLines.length) {
      sections.push(`CAST:\n${castLines.join("\n")}`);
    }

    // AGE — protected, small.
    if (input.ageSummary) {
      sections.push(`AGE: ${input.ageSummary}`);
    }

    // FIRSTS — droppable (trim priority 3).
    const firstsLines = input.firsts.map((f) => `- ${f}`);

    // PAST STORIES — protected, with anti-repeat instruction.
    let pastStorySection: string | undefined;
    if (input.pastStorySummary) {
      pastStorySection =
        `PAST STORIES (avoid repeating recent plots/themes):\n` +
        `${input.pastStorySummary}`;
    }

    // PHOTO CONTEXT — droppable (trim priority 2); write-only text only.
    const visionLines = input.visionText.map((v) => `- ${v}`);

    // RECENT LIFE CONTEXT — significant protected, ordinary droppable (priority 1).
    const rendered = renderMoments(input.moments);
    const ordinaryLines = [...rendered.ordinary];
    const significantLines = [...rendered.significant];

    // Greedy trim: drop ordinary Moments first, then vision-text, then firsts,
    // until the assembled block fits the token budget. Cast, age, the past-Story
    // summary, and significant Moments are always protected.
    const build = () => {
      const parts: string[] = [...sections];
      if (pastStorySection) parts.push(pastStorySection);
      if (visionLines.length) parts.push(`PHOTO CONTEXT (described, not images):\n${visionLines.join("\n")}`);
      if (firstsLines.length) parts.push(`FIRSTS:\n${firstsLines.map((f) => `- ${f}`).join("\n")}`);
      const momentLines = [...significantLines, ...ordinaryLines];
      if (momentLines.length) {
        parts.push(`RECENT LIFE CONTEXT (background, not the Brief):\n${momentLines.join("\n")}`);
      }
      return parts.join("\n\n");
    };

    let block = build();
    while (estimateTokens(block) > STORY_CONTEXT_TOKEN_BUDGET) {
      if (ordinaryLines.length) {
        ordinaryLines.pop();
      } else if (visionLines.length) {
        visionLines.pop();
      } else if (firstsLines.length) {
        firstsLines.pop();
      } else {
        break; // Only protected content remains; cannot trim further.
      }
      block = build();
    }

    return block;
  }
}