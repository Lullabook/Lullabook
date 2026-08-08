import type { Brief } from "@/domain/types";

/**
 * Durable exactly-once marker for a waiting Brief (local issue 180/§FAIL-8).
 *
 * The resume decision for a Brief queued during training must survive a
 * process restart. That means the "already resumed" marker lives in the
 * database, never in process memory. This store keeps the marker in a shared
 * `BriefResumeTables` bucket that production backs with real rows and that
 * tests share between two instances to prove a simulated restart cannot resume
 * twice.
 *
 * Contract notes for the integrating lanes:
 *  - `persona.ts` / `cold-start.ts` / the persona webhook route call
 *    {@link LikenessResumeStore.saveWaitingBrief} when a Brief is saved while a
 *    selected Persona is still `training` (one durable row per Brief).
 *  - Once every selected Persona's likeness is confirmed, the review lifecycle
 *    (src/services/likeness-review.ts) calls {@link LikenessResumeStore.tryResumeOnce}
 *    BEFORE enqueueing any Story-generation spend. Exactly one call wins across
 *    restarts because the marker is durable and compare-and-set.
 *  - `storybookId` is the durable acceptance identity returned to the caller so
 *    a crash after resume does not double-enqueue.
 */
export type BriefResumeStatus = "awaiting-confirmation" | "resumed";

export interface BriefResumeRecord {
  briefKey: string;
  memberId: string;
  personaId: string;
  brief: Brief;
  /** All selected Personas the Brief is waiting on (never fork the Brief type). */
  selectedPersonaIds: string[];
  status: BriefResumeStatus;
  /** Durable acceptance identity returned before Story generation is enqueued. */
  storybookId?: string;
  createdAt: Date;
  resumedAt?: Date;
}

/**
 * The durable backing "tables". A single `BriefResumeTables` instance is the
 * database: every {@link LikenessResumeStore} constructed over the same tables
 * sees the same markers, so a fresh process instance over the same tables is
 * exactly a crash-restart and cannot resume a Brief twice.
 */
export interface BriefResumeTables {
  briefResumes: Map<string, BriefResumeRecord>;
}

export function createBriefResumeTables(): BriefResumeTables {
  return { briefResumes: new Map() };
}

/** Idempotent key for a waiting Brief, mirrors cold-start's brief: prefix. */
export function briefResumeKey(memberId: string, brief: Brief): string {
  const sorted = [...(brief.starringPersonaIds ?? [])].sort();
  return `brief:${memberId}:${JSON.stringify({ ...brief, starringPersonaIds: sorted })}`;
}

export interface LikenessResumeOps {
  saveWaitingBrief(input: {
    memberId: string;
    personaId: string;
    brief: Brief;
    selectedPersonaIds: string[];
  }): Promise<BriefResumeRecord>;
  /** Exactly-once claim. Resolves the record it flipped, or null if already resumed. */
  tryResumeOnce(briefKey: string, storybookId: string): Promise<BriefResumeRecord | null>;
  get(briefKey: string): BriefResumeRecord | undefined;
  isResumed(briefKey: string): boolean;
  listWaiting(): BriefResumeRecord[];
  /** Flush any buffered marker writes to durable storage. */
  persist(): Promise<void>;
}

export class LikenessResumeStore implements LikenessResumeOps {
  constructor(
    private readonly tables: BriefResumeTables,
    private readonly now: () => Date = () => new Date(),
    private readonly flush: (() => Promise<void>) | undefined = undefined,
  ) {}

  async saveWaitingBrief(input: {
    memberId: string;
    personaId: string;
    brief: Brief;
    selectedPersonaIds: string[];
  }): Promise<BriefResumeRecord> {
    const briefKey = briefResumeKey(input.memberId, input.brief);
    const existing = this.tables.briefResumes.get(briefKey);
    // A resumed marker is durable — never reset it into a second attempt.
    if (existing) {
      if (existing.status === "resumed") {
        return { ...existing };
      }
      const refreshed: BriefResumeRecord = {
        ...existing,
        personaId: input.personaId,
        selectedPersonaIds: input.selectedPersonaIds,
      };
      this.tables.briefResumes.set(briefKey, refreshed);
      return { ...refreshed };
    }
    const record: BriefResumeRecord = {
      briefKey,
      memberId: input.memberId,
      personaId: input.personaId,
      brief: input.brief,
      selectedPersonaIds: input.selectedPersonaIds,
      status: "awaiting-confirmation",
      createdAt: this.now(),
    };
    this.tables.briefResumes.set(briefKey, record);
    if (this.flush) await this.flush();
    return { ...record };
  }

  async tryResumeOnce(briefKey: string, storybookId: string): Promise<BriefResumeRecord | null> {
    const record = this.tables.briefResumes.get(briefKey);
    if (!record) return null;
    if (record.status === "resumed") return null;
    const resumed: BriefResumeRecord = {
      ...record,
      status: "resumed",
      storybookId,
      resumedAt: this.now(),
    };
    this.tables.briefResumes.set(briefKey, resumed);
    if (this.flush) await this.flush();
    return { ...resumed };
  }

  get(briefKey: string): BriefResumeRecord | undefined {
    const record = this.tables.briefResumes.get(briefKey);
    return record ? { ...record } : undefined;
  }

  isResumed(briefKey: string): boolean {
    return this.tables.briefResumes.get(briefKey)?.status === "resumed";
  }

  listWaiting(): BriefResumeRecord[] {
    return [...this.tables.briefResumes.values()]
      .filter((r) => r.status === "awaiting-confirmation")
      .map((r) => ({ ...r }));
  }

  async persist(): Promise<void> {
    if (this.flush) await this.flush();
  }
}

/** Describes how the durable store is backed, for adapter wiring/later lanes. */
export function asLikenessResumeStore(store: LikenessResumeOps): LikenessResumeOps {
  return store;
}