import { v4 as uuid } from "uuid";
import type {
  Baby,
  BabyPersonBond,
  Character,
  ConsentReceipt,
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
} from "@/domain/types";

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
  invites = new Map<string, { id: string; familyId: string; email: string; invitedBy: string }>();
  bannedAccounts = new Set<string>();
  purgeScheduled = new Map<string, { familyId: string; purgeAt: Date }>();
  persistedGenerations = new Map<string, PersistedGeneration>();
  textStories = new Map<string, TextStory>();
  pushSubscriptions = new Map<string, PushSubscription>();
  emailPlusVpcRequests = new Map<string, EmailPlusVpcRequest>();
  babies = new Map<string, Baby>();
  babyPersonBonds = new Map<string, BabyPersonBond>();
  voiceClips = new Map<string, VoiceClip>();
  voiceConsentReceipts = new Map<string, VoiceConsentReceipt>();

  createFamily(): Family {
    const family: Family = { id: uuid(), createdAt: new Date() };
    this.families.set(family.id, family);
    return family;
  }

  createMember(input: Omit<Member, "id" | "createdAt">): Member {
    const member: Member = {
      selectedBabyId: null,
      ...input,
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
    return [...this.babyPersonBonds.values()].filter((b) => b.babyId === babyId);
  }

  saveBabyPersonBond(bond: BabyPersonBond): void {
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

  saveSubscription(sub: Subscription): void {
    this.subscriptions.set(sub.familyId, sub);
  }

  saveConsentReceipt(receipt: ConsentReceipt): void {
    this.consentReceipts.set(receipt.id, receipt);
  }

  getConsentReceiptForFamily(familyId: string): ConsentReceipt | undefined {
    return [...this.consentReceipts.values()].find((r) => r.familyId === familyId);
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

  savePendingBrief(key: string, brief: PendingBrief): void {
    this.pendingBriefs.set(key, brief);
  }

  getPendingBrief(key: string): PendingBrief | undefined {
    return this.pendingBriefs.get(key);
  }

  deletePendingBrief(key: string): void {
    this.pendingBriefs.delete(key);
  }

  hardDeleteFamily(familyId: string): void {
    const bookIds = [...this.storybooks.values()]
      .filter((b) => b.familyId === familyId)
      .map((b) => b.id);
    const memberIds = new Set(
      [...this.members.values()].filter((m) => m.familyId === familyId).map((m) => m.id)
    );

    const personaIds = [...this.personas.values()]
      .filter((p) => p.familyId === familyId)
      .map((p) => p.id);

    for (const [id, p] of this.pages) {
      if (bookIds.includes(p.storybookId)) this.pages.delete(id);
    }
    for (const [id, c] of this.pageCandidates) {
      const page = this.pages.get(c.pageId);
      if (!page) this.pageCandidates.delete(id);
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
    for (const [key] of this.pendingBriefs) {
      const pending = this.pendingBriefs.get(key);
      if (pending && memberIds.has(pending.memberId)) this.pendingBriefs.delete(key);
    }
    for (const [id, e] of this.moderationAudit) {
      const isMatch =
        memberIds.has(e.resourceId) ||
        bookIds.includes(e.resourceId) ||
        personaIds.includes(e.resourceId) ||
        [...memberIds].some((m) => e.resourceId.includes(m));
      if (isMatch) {
        this.moderationAudit.delete(id);
      }
    }
    for (const [id, p] of this.pushSubscriptions) {
      if (memberIds.has(p.memberId)) this.pushSubscriptions.delete(id);
    }
    for (const [id, r] of this.emailPlusVpcRequests) {
      if (r.familyId === familyId) this.emailPlusVpcRequests.delete(id);
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
