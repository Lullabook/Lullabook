import { v4 as uuid } from "uuid";
import { getProductionStoryModel } from "@/adapters/anthropic";
import type { AnthropicAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { TextStory, TextStoryBrief } from "@/domain/types";
import { TEXT_WORST_CASE_UNITS } from "@/lib/provider-prices";
import { ChildSafetyService } from "@/services/child-safety";
import {
  type PayableAttemptAuthorization,
  ProviderCostMeteringService,
  type MarginEvidence,
} from "@/services/provider-cost-metering";

/**
 * Free/Character-tier Story text (issue 46).
 *
 * Issue 190 — payable spend boundary: every text attempt is authorized BEFORE
 * the Anthropic provider call and recorded with a non-zero, versioned
 * worst-case estimate. The kill-switch gate always applies. When the
 * composition supplies margin evidence, the full authorization gate (margin
 * floor + budget variance, fail closed on red) applies; otherwise the
 * kill-switch gate still blocks red controls before the boundary.
 */
export class TextStoryService {
  constructor(
    private readonly store: DataStore,
    private readonly anthropic: AnthropicAdapter,
    private readonly childSafety: ChildSafetyService,
    private readonly costMeter: ProviderCostMeteringService = new ProviderCostMeteringService(store),
    private readonly marginEvidence?: MarginEvidence
  ) {}

  async generate(memberId: string, brief: TextStoryBrief): Promise<TextStory> {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    if (!brief.starringCharacterIds.length) {
      throw new Error("At least one Character required");
    }

    const characters = brief.starringCharacterIds.map((id) => {
      const character = this.store.getCharacter(id, memberId);
      if (!character) throw new Error(`Character ${id} not found`);
      return character;
    });

    const operationKey = `text-story/${member.familyId}/${uuid()}`;
    const marginEvidence =
      this.marginEvidence ?? this.costMeter.deriveMarginEvidence(member.familyId) ?? undefined;

    // Text moderation is a payable provider boundary too. It must be priced
    // and authorized before the classifier receives the Brief note.
    const moderationRoute = {
      provider: "sightengine",
      endpoint: "https://api.sightengine.com/1.0/check.json",
      model: "image-and-text",
    } as const;
    if (brief.note) {
      const moderationAuthorization = this.costMeter.authorizePayableAttempt({
        familyId: member.familyId,
        ...moderationRoute,
        units: { checks: 1 },
        attemptKey: `${operationKey}/moderation`,
        marginEvidence,
      });
      const moderationStartedAt = Date.now();
      try {
        await this.childSafety.checkText(brief.note, `text-story-${member.id}`, member.familyId);
        this.costMeter.recordAttempt({
          ...moderationRoute,
          pricingVersion: moderationAuthorization.pricingVersion,
          units: { checks: 1 },
          estimatedCostUsd: moderationAuthorization.estimatedCostUsd,
          latencyMs: Math.max(0, Date.now() - moderationStartedAt),
          requestId: moderationAuthorization.attemptKey,
          owningEntityIds: { familyId: member.familyId },
          attemptType: "moderation",
          outcome: "succeeded",
        });
      } catch (error) {
        this.costMeter.recordAttempt({
          ...moderationRoute,
          pricingVersion: moderationAuthorization.pricingVersion,
          units: { checks: 1 },
          estimatedCostUsd: moderationAuthorization.estimatedCostUsd,
          latencyMs: Math.max(0, Date.now() - moderationStartedAt),
          requestId: moderationAuthorization.attemptKey,
          owningEntityIds: { familyId: member.familyId },
          attemptType: "moderation",
          outcome: "failed",
        });
        throw error;
      }
    }

    // Issue 190: authorize payable text spend immediately before the provider
    // boundary. A blocked attempt records nothing and never reaches the
    // provider; missing margin evidence fails closed.
    const route = {
      provider: "anthropic" as const,
      endpoint: "messages.create" as const,
      model: getProductionStoryModel(),
    };
    const authorization = this.costMeter.authorizePayableAttempt({
      familyId: member.familyId,
      ...route,
      units: { ...TEXT_WORST_CASE_UNITS },
      attemptKey: `${operationKey}/anthropic`,
      marginEvidence,
    });

    const startedAt = Date.now();
    let text: string;
    try {
      ({ text } = await this.anthropic.generateTextStory({
        theme: brief.theme,
        note: brief.note,
        storyType: brief.storyType,
        characters: characters.map((c) => ({
          displayName: c.displayName,
          questionnaire: c.questionnaire,
        })),
      }));
    } catch (error) {
      this.recordTextAttempt(member.familyId, route, authorization, startedAt, "failed");
      throw error;
    }
    this.recordTextAttempt(member.familyId, route, authorization, startedAt, "succeeded");

    const story: TextStory = {
      id: uuid(),
      familyId: member.familyId,
      createdByMemberId: memberId,
      brief,
      text,
      createdAt: new Date(),
    };
    this.store.saveTextStory(story);
    return story;
  }

  /** Secret-free ledger row: ownership + request id + latency + terminal outcome only. */
  private recordTextAttempt(
    familyId: string,
    route: { provider: "anthropic"; endpoint: "messages.create"; model: string },
    authorization: PayableAttemptAuthorization,
    startedAt: number,
    outcome: "succeeded" | "failed"
  ): void {
    this.costMeter.recordAttempt({
      ...route,
      pricingVersion: authorization.pricingVersion,
      units: { ...TEXT_WORST_CASE_UNITS },
      estimatedCostUsd: authorization.estimatedCostUsd,
      latencyMs: Math.max(0, Date.now() - startedAt),
      requestId: authorization.attemptKey,
      owningEntityIds: { familyId },
      attemptType: "text",
      outcome,
    });
  }
}
