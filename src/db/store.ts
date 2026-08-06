import { v4 as uuid } from "uuid";
import type {
  Baby,
  BabyPersonBond,
  Character,
  ConsentReceipt,
  CustomStyle,
  Family,
  LightConsentReceipt,
  Member,
  ModerationAuditEntry,
  Page,
  PageCandidate,
  PendingBrief,
  PersistedGeneration,
  Persona,
  ShareLink,
  Storybook,
  Subscription,
  TextStory,
  PushSubscription,
  EmailPlusVpcRequest,
  VoiceClip,
  VoiceConsentReceipt,
  Moment,
  MomentPersonLink,
  BabyAutoContextWatermark,
  BabyPastStorySummary,
  JournalNudgeState,
  Invite,
} from "@/domain/types";
import type { FalTrainingRequestRecord, FalWebhookReceipt } from "@/adapters/types";

export interface PendingBriefClaimResult {
  pending: PendingBrief;
  claimedNow: boolean;
}

/**
 * Hydration scope for SupabaseDataStore (issue 192).
 *  - `full` (default): every Family table, including append-only ledgers and
 *    worker registers — required for write/RLS/Hard-delete paths.
 *  - `read`: ordinary authenticated reads — no append-only ledgers, one
 *    flattened parallel wave (≤2 sequential waves with the member lookup).
 *  - `minimal`: the authenticated Member row only — image/avatar routes that
 *    only need the Family boundary for a blob-key prefix check.
 */
export type HydrationProfile = "full" | "read" | "minimal";

export class DataStore {
  families = new Map<string, Family>();
  members = new Map<string, Member>();
  personas = new Map<string, Persona>();
  characters = new Map<string, Character>();
  subscriptions = new Map<string, Subscription>();
  consentReceipts = new Map<string, ConsentReceipt>();
  lightConsentReceipts = new Map<string, LightConsentReceipt>();
  storybooks = new Map<string, Storybook>();
  pages = new Map<string, Page>();
  pageCandidates = new Map<string, PageCandidate>();
  shareLinks = new Map<string, ShareLink>();
  moderationAudit = new Map<string, ModerationAuditEntry>();
  pendingBriefs = new Map<string, PendingBrief>();
  invites = new Map<string, Invite>();
  bannedAccounts = new Set<string>();
  purgeScheduled = new Map<string, { familyId: string; purgeAt: Date }>();
  persistedGenerations = new Map<string, PersistedGeneration>();
  textStories = new Map<string, TextStory>();
  /** Server-side Story allowance ledger: append-only reservation/refund history. */
  storyAllowanceReservations = new Map<
    string,
    {
      storybookId: string;
      familyId: string;
      status: "reserved" | "committed" | "released";
      createdAt: Date;
      releasedAt?: Date;
      releaseReason?: string;
    }
  >();
  /** Provider COGS attempts; rows are sanitized before they enter this map. */
  providerCostLedgerEntries = new Map<string, import("@/services/provider-cost-metering").ProviderCostLedgerEntry>();
  /** Active cost/reliability kill switches, also server-authoritative. */
  providerKillSwitches = new Map<string, import("@/services/provider-cost-metering").ProviderKillSwitch>();
  pushSubscriptions = new Map<string, PushSubscription>();
  emailPlusVpcRequests = new Map<string, EmailPlusVpcRequest>();
  babies = new Map<string, Baby>();
  babyPersonBonds = new Map<string, BabyPersonBond>();
  voiceClips = new Map<string, VoiceClip>();
  voiceConsentReceipts = new Map<string, VoiceConsentReceipt>();
  moments = new Map<string, Moment>();
  // Issue 119: credit ledger persisted in the durable store (not in-memory).
  creditLedgerEntries = new Map<string, { id: string; familyId: string; action: string; idempotencyKey: string; type: "debit" | "refund" | "purchase"; amount: number; createdAt: Date }>();
  creditPurchasedBalances = new Map<string, number>();
  momentPeople = new Map<string, MomentPersonLink>();
  autoContextWatermarks = new Map<string, BabyAutoContextWatermark>();
  babyPastStorySummaries = new Map<string, BabyPastStorySummary>();
  journalNudgeStates = new Map<string, JournalNudgeState>();
  customStyles = new Map<string, CustomStyle>();
  /** Durable provider request metadata; credentials and raw image bytes never enter these rows. */
  falTrainingRequests = new Map<string, FalTrainingRequestRecord>();
  /** Callback fingerprints make at-least-once provider delivery harmless. */
  falWebhookReceipts = new Map<string, FalWebhookReceipt>();
  /** Family-scoped, ID-only Story Context provenance; never raw prompt/photo content. */
  storyContextProvenance = new Map<string, {
    id: string;
    familyId: string;
    storybookId: string;
    babyId?: string;
    personaIds: string[];
    momentIds: string[];
    firstCount?: number;
    pastStorySummaryIncluded?: boolean;
    photoDescriptionCount?: number;
    tokenEstimate: number;
  }>();

  createFamily(): Family {
    const family: Family = { id: uuid(), createdAt: new Date() };
    this.families.set(family.id, family);
    return family;
  }

  createMember(input: Omit<Member, "id" | "createdAt" | "selectedBabyId"> & { selectedBabyId?: string | null }): Member {
    const member: Member = {
      ...input,
      selectedBabyId: input.selectedBabyId ?? null,
      id: uuid(),
      createdAt: new Date(),
    };
    this.members.set(member.id, member);
    return member;
  }

  getBabiesByFamily(familyId: string, actorMemberId: string): Baby[] {
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) {
      throw new RlsViolationError("Cannot read babies for another family");
    }
    return [...this.babies.values()].filter((b) => b.familyId === familyId);
  }

  getBaby(id: string, actorMemberId: string): Baby | undefined {
    const baby = this.babies.get(id);
    if (!baby) return undefined;
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== baby.familyId) {
      throw new RlsViolationError("Cannot read baby for another family");
    }
    return baby;
  }

  saveBaby(baby: Baby): void {
    this.babies.set(baby.id, baby);
  }

  getBondsForBaby(babyId: string, actorMemberId: string): BabyPersonBond[] {
    const baby = this.getBaby(babyId, actorMemberId);
    if (!baby) throw new RlsViolationError("Cannot read bonds for another family");
    return [...this.babyPersonBonds.values()].filter((b) => {
      if (b.babyId !== babyId) return false;
      const persona = this.personas.get(b.personaId);
      return persona?.familyId === baby.familyId;
    });
  }

  saveBabyPersonBond(bond: BabyPersonBond): void {
    const baby = this.babies.get(bond.babyId);
    const persona = this.personas.get(bond.personaId);
    if (!baby || !persona || baby.familyId !== persona.familyId) {
      throw new RlsViolationError("Cannot create a bond across families");
    }
    this.babyPersonBonds.set(bond.id, bond);
  }

  getVoiceClipsForPersona(personaId: string, actorMemberId: string): VoiceClip[] {
    const persona = this.getPersona(personaId, actorMemberId);
    if (!persona) throw new RlsViolationError("Cannot read voice clips for another family");
    return [...this.voiceClips.values()].filter((c) => c.personaId === personaId);
  }

  getVoiceClip(id: string, actorMemberId: string): VoiceClip | undefined {
    const clip = this.voiceClips.get(id);
    if (!clip) return undefined;
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== clip.familyId) {
      throw new RlsViolationError("Cannot read voice clip for another family");
    }
    return clip;
  }

  saveVoiceClip(clip: VoiceClip): void {
    this.voiceClips.set(clip.id, clip);
  }

  deleteVoiceClip(id: string): void {
    this.voiceClips.delete(id);
  }

  getVoiceConsentForPersona(personaId: string): VoiceConsentReceipt | undefined {
    return [...this.voiceConsentReceipts.values()].find(
      (r) => r.personaId === personaId && !r.revokedAt
    );
  }

  saveVoiceConsentReceipt(receipt: VoiceConsentReceipt): void {
    this.voiceConsentReceipts.set(receipt.id, receipt);
  }

  getMomentsForBaby(babyId: string, actorMemberId: string): Moment[] {
    const baby = this.getBaby(babyId, actorMemberId);
    if (!baby) throw new RlsViolationError("Cannot read moments for another family");
    return [...this.moments.values()]
      .filter((m) => m.babyId === babyId)
      .sort((a, b) => {
        const dateCmp = b.occurredOn.localeCompare(a.occurredOn);
        if (dateCmp !== 0) return dateCmp;
        return b.createdAt.getTime() - a.createdAt.getTime();
      });
  }

  saveMoment(moment: Moment): void {
    this.moments.set(moment.id, moment);
  }

  deleteMoment(id: string): void {
    this.moments.delete(id);
    for (const [linkId, link] of this.momentPeople) {
      if (link.momentId === id) this.momentPeople.delete(linkId);
    }
  }

  getMomentPeople(momentId: string): MomentPersonLink[] {
    return [...this.momentPeople.values()].filter((l) => l.momentId === momentId);
  }

  saveMomentPersonLink(link: MomentPersonLink): void {
    this.momentPeople.set(link.id, link);
  }

  deleteMomentPeopleForPersona(personaId: string): void {
    for (const [id, link] of this.momentPeople) {
      if (link.personaId === personaId) this.momentPeople.delete(id);
    }
  }

  deleteMomentPeopleForCharacter(characterId: string): void {
    for (const [id, link] of this.momentPeople) {
      if (link.characterId === characterId) this.momentPeople.delete(id);
    }
  }

  getAutoContextWatermark(babyId: string): BabyAutoContextWatermark | undefined {
    return this.autoContextWatermarks.get(babyId);
  }

  saveAutoContextWatermark(watermark: BabyAutoContextWatermark): void {
    this.autoContextWatermarks.set(watermark.babyId, watermark);
  }

  /**
   * Per-Baby rolling past-Story summaries in insertion order (oldest→newest).
   * Insertion order is the monotonic tiebreaker: when two summaries share a
   * `createdAt` ms (e.g. rapid back-to-back finalizations), the one inserted
   * later is newer, so the service's `.slice(-N)` keeps the true newest-N. RLS-gated.
   */
  getBabyPastStorySummaries(babyId: string, actorMemberId: string): BabyPastStorySummary[] {
    const baby = this.getBaby(babyId, actorMemberId); // throws RlsViolationError across families
    if (!baby) return [];
    return [...this.babyPastStorySummaries.values()].filter((s) => s.babyId === babyId);
  }

  saveBabyPastStorySummary(summary: BabyPastStorySummary): void {
    this.babyPastStorySummaries.set(summary.id, summary);
  }

  getJournalNudgeStates(memberId: string, babyId: string): JournalNudgeState[] {
    return [...this.journalNudgeStates.values()].filter(
      (s) => s.memberId === memberId && s.babyId === babyId
    );
  }

  saveJournalNudgeState(state: JournalNudgeState): void {
    this.journalNudgeStates.set(state.id, state);
  }

  getPersonasByRosterGroup(rosterGroupId: string, actorMemberId: string): Persona[] {
    const actor = this.members.get(actorMemberId);
    if (!actor) throw new RlsViolationError("Member not found");
    const babyIds = [...this.babies.values()]
      .filter((b) => b.rosterGroupId === rosterGroupId && b.familyId === actor.familyId)
      .map((b) => b.id);
    const personaIds = new Set(
      [...this.babyPersonBonds.values()]
        .filter((b) => babyIds.includes(b.babyId))
        .map((b) => b.personaId)
    );
    return [...this.personas.values()].filter(
      (p) => p.familyId === actor.familyId && (personaIds.size === 0 || personaIds.has(p.id))
    );
  }

  getMemberByAuthUserId(authUserId: string): Member | undefined {
    return [...this.members.values()].find((m) => m.authUserId === authUserId);
  }

  getMembersByFamily(familyId: string): Member[] {
    return [...this.members.values()].filter((m) => m.familyId === familyId);
  }

  getPersonasByFamily(familyId: string, actorMemberId: string): Persona[] {
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) {
      throw new RlsViolationError("Cannot read personas for another family");
    }
    return [...this.personas.values()].filter((p) => p.familyId === familyId);
  }

  getPersona(id: string, actorMemberId: string): Persona | undefined {
    const persona = this.personas.get(id);
    if (!persona) return undefined;
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== persona.familyId) {
      throw new RlsViolationError("Cannot read persona for another family");
    }
    return persona;
  }

  savePersona(persona: Persona): void {
    this.personas.set(persona.id, persona);
  }

  /** RLS-gated update seam used by direct-client contract tests. */
  updatePersona(
    id: string,
    actorMemberId: string,
    patch: Partial<Pick<Persona, "displayName" | "status" | "loraWeightKey" | "avatarKey">>
  ): Persona {
    const persona = this.getPersona(id, actorMemberId);
    if (!persona) throw new Error("Persona not found");
    Object.assign(persona, patch);
    this.personas.set(id, persona);
    return persona;
  }

  /** RLS-gated delete seam; callers cannot turn a foreign id into a probe. */
  deletePersona(id: string, actorMemberId: string): void {
    const persona = this.getPersona(id, actorMemberId);
    if (!persona) return;
    this.personas.delete(id);
  }

  /**
   * Return only Family-owned object keys after enforcing the authenticated
   * Member's Family boundary. Provider URLs are intentionally not represented.
   */
  getFamilyOwnedObjectKeys(familyId: string, actorMemberId: string): string[] {
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) {
      throw new RlsViolationError("Cannot infer object keys for another family");
    }
    const keys = new Set<string>();
    for (const persona of this.personas.values()) {
      if (persona.familyId !== familyId) continue;
      if (persona.loraWeightKey) keys.add(persona.loraWeightKey);
      if (persona.avatarKey) keys.add(persona.avatarKey);
      for (const key of persona.reviewSampleKeys ?? []) keys.add(key);
    }
    for (const request of this.falTrainingRequests.values()) {
      if (request.familyId !== familyId) continue;
      for (const key of [request.inputZipKey, request.loraWeightKey, request.configurationKey]) {
        if (key) keys.add(key);
      }
    }
    for (const style of this.customStyles.values()) {
      if (style.familyId === familyId && style.loraWeightKey) keys.add(style.loraWeightKey);
    }
    const bookIds = new Set(
      [...this.storybooks.values()].filter((book) => book.familyId === familyId).map((book) => book.id)
    );
    for (const page of this.pages.values()) {
      if (!bookIds.has(page.storybookId)) continue;
      if (page.illustrationBlobKey) keys.add(page.illustrationBlobKey);
      if (page.videoBlobKey) keys.add(page.videoBlobKey);
    }
    return [...keys];
  }

  getCharactersByFamily(familyId: string, actorMemberId: string): Character[] {
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) {
      throw new RlsViolationError("Cannot read characters for another family");
    }
    return [...this.characters.values()].filter((c) => c.familyId === familyId);
  }

  getCharacter(id: string, actorMemberId: string): Character | undefined {
    const character = this.characters.get(id);
    if (!character) return undefined;
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== character.familyId) {
      throw new RlsViolationError("Cannot read character for another family");
    }
    return character;
  }

  saveCharacter(character: Character): void {
    this.characters.set(character.id, character);
  }

  deleteCharacter(id: string): void {
    this.deleteMomentPeopleForCharacter(id);
    this.characters.delete(id);
  }

  deleteLightConsentReceiptsForCharacter(characterId: string): void {
    for (const [id, r] of this.lightConsentReceipts) {
      if (r.characterId === characterId) this.lightConsentReceipts.delete(id);
    }
  }

  saveTextStory(story: TextStory): void {
    this.textStories.set(story.id, story);
  }

  getTextStory(id: string, actorMemberId: string): TextStory | undefined {
    const story = this.textStories.get(id);
    if (!story) return undefined;
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== story.familyId) {
      throw new RlsViolationError("Cannot read text story for another family");
    }
    return story;
  }

  saveLightConsentReceipt(receipt: LightConsentReceipt): void {
    this.lightConsentReceipts.set(receipt.id, receipt);
  }

  getLightConsentReceiptForCharacter(characterId: string): LightConsentReceipt | undefined {
    return [...this.lightConsentReceipts.values()].find((r) => r.characterId === characterId);
  }

  getSubscription(familyId: string): Subscription | undefined {
    return this.subscriptions.get(familyId);
  }

  /**
   * Durable persistence seam for the pre-provider cost reservation (issue
   * 204). The base in-memory store keeps everything in memory, so this is a
   * no-op; SupabaseDataStore overrides it to flush reserved cost-ledger rows
   * to durable storage AFTER {@link LiveFalSpendCapService.reserve} writes
   * the hold but BEFORE the provider await, so a crash mid-call cannot lose
   * the spend cap.
   */
  async persistProviderSpendState(): Promise<void> {}

  saveSubscription(sub: Subscription): void {
    this.subscriptions.set(sub.familyId, sub);
  }

  saveConsentReceipt(receipt: ConsentReceipt): void {
    this.consentReceipts.set(receipt.id, receipt);
  }

  /**
   * SEC (172 red-team): a family can legitimately hold receipts of SEVERAL
   * methods (e.g. Stripe webhook writes payment_vpc, then the Guardian
   * completes email_plus). First-receipt-wins bricked verified families, so
   * when `method` is given, only a receipt of THAT method matches. Legacy
   * receipts without a method count as payment_vpc (fail closed elsewhere).
   */
  getConsentReceiptForFamily(
    familyId: string,
    method?: string,
    jurisdiction?: string
  ): ConsentReceipt | undefined {
    return [...this.consentReceipts.values()].find(
      (r) =>
        r.familyId === familyId &&
        (method === undefined || (r.method ?? "payment_vpc") === method) &&
        (jurisdiction === undefined || r.jurisdiction === jurisdiction) &&
        (r.status ?? "verified") === "verified" &&
        (r.expiresAt === undefined || r.expiresAt === null || r.expiresAt.getTime() > Date.now())
    );
  }

  getPushSubscriptionsForMember(
    targetMemberId: string,
    actorMemberId: string
  ): PushSubscription[] {
    if (targetMemberId !== actorMemberId) {
      throw new RlsViolationError("Cannot read push subscriptions for another member");
    }
    return [...this.pushSubscriptions.values()].filter((s) => s.memberId === targetMemberId);
  }

  getEmailPlusVpcRequestsForFamily(
    familyId: string,
    actorMemberId: string
  ): Omit<EmailPlusVpcRequest, "token">[] {
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) {
      throw new RlsViolationError("Cannot read Email-Plus VPC requests for another family");
    }
    return [...this.emailPlusVpcRequests.values()]
      .filter((r) => r.familyId === familyId)
      .map(({ token: _token, ...rest }) => rest);
  }

  saveStorybook(book: Storybook): void {
    this.storybooks.set(book.id, book);
  }

  savePersistedGeneration(generation: PersistedGeneration): void {
    this.persistedGenerations.set(generation.storybookId, generation);
  }

  getPersistedGeneration(storybookId: string): PersistedGeneration | undefined {
    return this.persistedGenerations.get(storybookId);
  }

  getStorybook(id: string, actorMemberId: string): Storybook | undefined {
    const book = this.storybooks.get(id);
    if (!book) return undefined;
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== book.familyId) {
      throw new RlsViolationError("Cannot read storybook for another family");
    }
    if (book.status === "draft" && book.createdByMemberId !== actorMemberId) {
      throw new RlsViolationError("Draft storybooks are private to creator");
    }
    return book;
  }

  listStorybooksForFamily(familyId: string, actorMemberId: string): Storybook[] {
    const actor = this.members.get(actorMemberId);
    if (!actor || actor.familyId !== familyId) {
      throw new RlsViolationError("Cannot list storybooks for another family");
    }
    return [...this.storybooks.values()].filter((b) => {
      if (b.familyId !== familyId) return false;
      if (b.status === "draft" && b.createdByMemberId !== actorMemberId) return false;
      return true;
    });
  }

  listStorybooksForBaby(babyId: string, actorMemberId: string): Storybook[] {
    const baby = this.getBaby(babyId, actorMemberId);
    if (!baby) throw new RlsViolationError("Cannot list storybooks for another family");
    return this.listStorybooksForFamily(baby.familyId, actorMemberId).filter(
      (b) => !b.babyId || b.babyId === babyId
    );
  }

  savePage(page: Page): void {
    this.pages.set(page.id, page);
  }

  getPagesForStorybook(storybookId: string): Page[] {
    return [...this.pages.values()]
      .filter((p) => p.storybookId === storybookId)
      .sort((a, b) => a.index - b.index);
  }

  savePageCandidate(candidate: PageCandidate): void {
    this.pageCandidates.set(candidate.id, candidate);
  }

  getCandidatesForPage(pageId: string): PageCandidate[] {
    return [...this.pageCandidates.values()].filter((c) => c.pageId === pageId);
  }

  saveShareLink(link: ShareLink): void {
    this.shareLinks.set(link.id, link);
  }

  getShareLinkByToken(token: string): ShareLink | undefined {
    return [...this.shareLinks.values()].find((l) => l.token === token);
  }

  saveModerationAudit(entry: ModerationAuditEntry): void {
    this.moderationAudit.set(entry.id, entry);
  }

  /** Durable webhook inbox seam; Supabase overrides this with an atomic insert. */
  async claimRevenueCatEvent(entry: ModerationAuditEntry): Promise<boolean> {
    if (this.moderationAudit.has(entry.id)) return false;
    this.moderationAudit.set(entry.id, entry);
    return true;
  }

  savePendingBrief(key: string, brief: PendingBrief): void {
    this.pendingBriefs.set(key, brief);
  }

  getPendingBrief(key: string): PendingBrief | undefined {
    return this.pendingBriefs.get(key);
  }

  /**
   * Deterministic fallback for tests/local stores. SupabaseDataStore overrides
   * this with the row-locking app_claim_pending_brief RPC used in production.
   */
  async claimPendingBrief(
    key: string,
    claimToken: string,
    now: Date,
    leaseExpiresAt: Date
  ): Promise<PendingBriefClaimResult> {
    const pending = this.pendingBriefs.get(key);
    if (!pending) throw new Error("Pending Brief is missing");
    if (pending.status === "accepted") {
      return { pending, claimedNow: false };
    }
    if (
      pending.status === "running" &&
      pending.claimExpiresAt !== undefined &&
      pending.claimExpiresAt.getTime() > now.getTime()
    ) {
      return { pending, claimedNow: false };
    }
    const claimed: PendingBrief = {
      ...pending,
      status: "running",
      claimToken,
      claimedAt: now,
      claimExpiresAt: leaseExpiresAt,
      failedAt: undefined,
      error: undefined,
    };
    this.pendingBriefs.set(key, claimed);
    return { pending: claimed, claimedNow: true };
  }

  deletePendingBrief(key: string): void {
    this.pendingBriefs.delete(key);
  }

  getModerationAuditIdsByFamily(familyId: string): string[] {
    const memberIds = [...this.members.values()]
      .filter((member) => member.familyId === familyId)
      .map((member) => member.id);
    const personaIds = new Set(
      [...this.personas.values()]
        .filter((persona) => persona.familyId === familyId)
        .map((persona) => persona.id)
    );
    const characterIds = new Set(
      [...this.characters.values()]
        .filter((character) => character.familyId === familyId)
        .map((character) => character.id)
    );
    const bookIds = new Set(
      [...this.storybooks.values()]
        .filter((book) => book.familyId === familyId)
        .map((book) => book.id)
    );
    const pageIds = new Set(
      [...this.pages.values()]
        .filter((page) => bookIds.has(page.storybookId))
        .map((page) => page.id)
    );
    const candidateIds = new Set(
      [...this.pageCandidates.values()]
        .filter((candidate) => pageIds.has(candidate.pageId))
        .map((candidate) => candidate.id)
    );

    return [...this.moderationAudit.entries()]
      .filter(([, entry]) => {
        // Explicit durable ownership is authoritative. Legacy resource-ID
        // inference is only for historical rows that predate familyId.
        if (entry.familyId !== undefined) return entry.familyId === familyId;
        if (personaIds.has(entry.resourceId) || characterIds.has(entry.resourceId)) return true;
        if ([...bookIds].some((bookId) =>
          entry.resourceId === bookId || entry.resourceId.startsWith(`${bookId}/`)
        )) return true;
        if (candidateIds.has(entry.resourceId.replace(/^candidate-/, ""))) return true;
        return memberIds.some((memberId) => entry.resourceId.includes(memberId));
      })
      .map(([id]) => id);
  }

  hardDeleteFamily(familyId: string): void {
    const bookIds = [...this.storybooks.values()]
      .filter((b) => b.familyId === familyId)
      .map((b) => b.id);
    const memberIds = new Set(
      [...this.members.values()].filter((m) => m.familyId === familyId).map((m) => m.id)
    );

    const moderationAuditIds = new Set(this.getModerationAuditIdsByFamily(familyId));

    const deletedPageIds = new Set(
      [...this.pages.values()]
        .filter((page) => bookIds.includes(page.storybookId))
        .map((page) => page.id)
    );
    for (const [id, p] of this.pages) {
      if (deletedPageIds.has(p.id)) this.pages.delete(id);
    }
    for (const [id, c] of this.pageCandidates) {
      if (deletedPageIds.has(c.pageId)) this.pageCandidates.delete(id);
    }
    for (const [id, l] of this.shareLinks) {
      if (bookIds.includes(l.storybookId)) this.shareLinks.delete(id);
    }

    for (const [id, m] of this.members) {
      if (m.familyId === familyId) this.members.delete(id);
    }
    for (const [id, p] of this.personas) {
      if (p.familyId === familyId) this.personas.delete(id);
    }
    for (const [id, c] of this.characters) {
      if (c.familyId === familyId) this.characters.delete(id);
    }
    for (const [id, r] of this.lightConsentReceipts) {
      if (r.familyId === familyId) this.lightConsentReceipts.delete(id);
    }
    for (const [id, b] of this.storybooks) {
      if (b.familyId === familyId) {
        this.storybooks.delete(id);
        this.persistedGenerations.delete(id);
      }
    }
    for (const [id, r] of this.consentReceipts) {
      if (r.familyId === familyId) this.consentReceipts.delete(id);
    }
    for (const [id, i] of this.invites) {
      if (i.familyId === familyId) this.invites.delete(id);
    }
    for (const [id, s] of this.textStories) {
      if (s.familyId === familyId) this.textStories.delete(id);
    }
    for (const [id, reservation] of this.storyAllowanceReservations) {
      if (reservation.familyId === familyId) this.storyAllowanceReservations.delete(id);
    }
    for (const [key] of this.pendingBriefs) {
      const pending = this.pendingBriefs.get(key);
      if (pending && memberIds.has(pending.memberId)) this.pendingBriefs.delete(key);
    }
    for (const id of moderationAuditIds) {
      this.moderationAudit.delete(id);
    }
    for (const [id, p] of this.pushSubscriptions) {
      if (memberIds.has(p.memberId)) this.pushSubscriptions.delete(id);
    }
    for (const [id, r] of this.emailPlusVpcRequests) {
      if (r.familyId === familyId) this.emailPlusVpcRequests.delete(id);
    }
    const familyRequestIds = new Set(
      [...this.falTrainingRequests.values()]
        .filter((request) => request.familyId === familyId)
        .map((request) => request.requestId)
    );
    for (const [id, request] of this.falTrainingRequests) {
      if (request.familyId === familyId) this.falTrainingRequests.delete(id);
    }
    for (const [id, receipt] of this.falWebhookReceipts) {
      if (familyRequestIds.has(receipt.requestId)) this.falWebhookReceipts.delete(id);
    }
    const babyIds = [...this.babies.values()]
      .filter((b) => b.familyId === familyId)
      .map((b) => b.id);
    for (const [id, b] of this.babyPersonBonds) {
      if (babyIds.includes(b.babyId)) this.babyPersonBonds.delete(id);
    }
    for (const [id, b] of this.babies) {
      if (b.familyId === familyId) this.babies.delete(id);
    }
    for (const [id, c] of this.voiceClips) {
      if (c.familyId === familyId) this.voiceClips.delete(id);
    }
    for (const [id, r] of this.voiceConsentReceipts) {
      if (r.familyId === familyId) this.voiceConsentReceipts.delete(id);
    }
    for (const [id, link] of this.momentPeople) {
      const moment = this.moments.get(link.momentId);
      if (moment && moment.familyId === familyId) this.momentPeople.delete(id);
    }
    for (const [id, m] of this.moments) {
      if (m.familyId === familyId) this.moments.delete(id);
    }
    for (const babyId of babyIds) {
      this.autoContextWatermarks.delete(babyId);
    }
    for (const [id, s] of this.babyPastStorySummaries) {
      if (babyIds.includes(s.babyId)) this.babyPastStorySummaries.delete(id);
    }
    for (const [id, s] of this.journalNudgeStates) {
      if (memberIds.has(s.memberId)) this.journalNudgeStates.delete(id);
    }
    for (const [id, s] of this.customStyles) {
      if (s.familyId === familyId) this.customStyles.delete(id);
    }

    for (const [id, provenance] of this.storyContextProvenance) {
      if (provenance.familyId === familyId) this.storyContextProvenance.delete(id);
    }
    for (const [id, reservation] of this.storyAllowanceReservations) {
      if (reservation.familyId === familyId) this.storyAllowanceReservations.delete(id);
    }

    for (const [id, entry] of this.creditLedgerEntries) {
      if (entry.familyId === familyId) this.creditLedgerEntries.delete(id);
    }
    this.creditPurchasedBalances.delete(familyId);

    // Hard-delete is the explicit exception to normal append-only financial
    // audit retention: all Family-scoped cost evidence and controls are erased.
    for (const [id, entry] of this.providerCostLedgerEntries) {
      if (entry.owningEntityIds.familyId === familyId) this.providerCostLedgerEntries.delete(id);
    }
    for (const [id, control] of this.providerKillSwitches) {
      if (control.familyId === familyId) this.providerKillSwitches.delete(id);
    }

    this.subscriptions.delete(familyId);
    this.families.delete(familyId);
    this.purgeScheduled.delete(familyId);
  }

  familyDataExists(familyId: string): boolean {
    if (this.families.has(familyId)) return true;
    return [...this.members.values()].some((m) => m.familyId === familyId);
  }
}

export class RlsViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RlsViolationError";
  }
}
