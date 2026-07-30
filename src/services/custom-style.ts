import { v4 as uuid } from "uuid";
import type { BlobStore, FalAdapter, WorkflowAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { CustomStyle } from "@/domain/types";
import { EntitlementService } from "@/services/entitlement";
import { CreditLedgerService } from "@/services/credit-ledger";
import { ProviderCostMeteringService } from "@/services/provider-cost-metering";

/**
 * Custom art-style trained Style-LoRA pipeline (issue 95 / ADR-0023).
 *
 * The Plus-tier custom art style: a durable pipeline that trains a **Style
 * LoRA** bound to the Household, used as a book's Style Bible — the same shape
 * as the persona LoRA pipeline (ADR-0002), metered via issue 94.
 *
 * **Failure → fallback + refund:** train failure falls back to the default
 * Style Bible (ADR-0012) and refunds the credit (issue 94); the Story is never
 * blocked.
 *
 * **Security:** the Style LoRA is a Family-scoped sensitive blob; it is
 * **purged by hard-delete** (ADR-0007). Training is gated to Plus entitlement
 * (403 otherwise) and metered by credits.
 */

export interface StartTrainingInput {
  familyId: string;
  memberId: string;
  referenceImages: Buffer[];
  seed: string;
}

export class CustomStyleService {
  constructor(
    private readonly store: DataStore,
    private readonly fal: FalAdapter,
    private readonly workflow: WorkflowAdapter,
    private readonly blobs: BlobStore,
    private readonly entitlements: EntitlementService,
    private readonly credits: CreditLedgerService,
    private readonly costMeter: ProviderCostMeteringService = new ProviderCostMeteringService(store)
  ) {}

  async startTraining(input: StartTrainingInput): Promise<CustomStyle> {
    // Gate: Plus only
    this.entitlements.requireCapability(input.familyId, "customStyle");

    // Meter: debit a custom-style credit (throws CreditError if exhausted)
    const trainingId = uuid();
    this.credits.debit(input.familyId, "customStyle", `style-train:${trainingId}`);

    const style: CustomStyle = {
      id: trainingId,
      familyId: input.familyId,
      createdByMemberId: input.memberId,
      seed: input.seed,
      status: "generating",
      loraWeightKey: null,
      createdAt: new Date(),
    };
    this.store.customStyles.set(style.id, style);

    // Store reference images
    for (let i = 0; i < input.referenceImages.length; i++) {
      await this.blobs.put(`styles/${input.familyId}/${style.id}/ref-${i}.jpg`, input.referenceImages[i]);
    }

    // Check the persisted control immediately before the paid submission,
    // rather than relying on the earlier credit debit as a spend authorization.
    this.costMeter.assertSpendAllowed({
      familyId: input.familyId,
      provider: "fal.ai",
      endpoint: "fal.training.start",
      model: "unknown-fal-model",
    });
    // Enqueue durable training step (async — completes on workflow.drain)
    const trainingJob = await this.fal.startTraining(input.referenceImages);

    this.workflow.enqueue("train-style-lora", async () => {
      const webhook = await this.workflow.waitForEvent<{
        status: string;
        loraWeightKey?: string;
      }>("fal.training.complete", trainingJob.jobId);

      const stored = this.store.customStyles.get(style.id);
      if (!stored) return;

      if (webhook.status === "ready") {
        stored.status = "ready";
        stored.loraWeightKey = webhook.loraWeightKey ?? `styles/${input.familyId}/${style.id}/lora.bin`;
        await this.blobs.put(
          stored.loraWeightKey,
          Buffer.from(`style-lora-weights-${style.id}`)
        );
        this.store.customStyles.set(style.id, stored);
      } else {
        stored.status = "failed";
        this.store.customStyles.set(style.id, stored);
        // Refund on failure
        this.credits.refund(input.familyId, "customStyle", `style-train:${trainingId}`);
      }
    });

    return this.store.customStyles.get(style.id)!;
  }

  /** Get the household's ready custom style (if any). */
  getReadyStyle(familyId: string, actorMemberId: string): CustomStyle | null {
    const actor = this.store.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) return null;
    for (const style of this.store.customStyles.values()) {
      if (style.familyId === familyId && style.status === "ready") {
        return style;
      }
    }
    return null;
  }

  /** Get all custom styles for a household. */
  getStylesForFamily(familyId: string, actorMemberId: string): CustomStyle[] {
    const actor = this.store.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) return [];
    return [...this.store.customStyles.values()].filter((s) => s.familyId === familyId);
  }
}
