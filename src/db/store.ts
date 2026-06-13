import { v4 as uuid } from "uuid";
import type {
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

  createFamily(): Family {
    const family: Family = { id: uuid(), createdAt: new Date() };
    this.families.set(family.id, family);
    return family;
  }

  createMember(input: Omit<Member, "id" | "createdAt">): Member {
    const member: Member = { ...input, id: uuid(), createdAt: new Date() };
    this.members.set(member.id, member);
    return member;
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
      if (memberIds.has(e.resourceId) || bookIds.includes(e.resourceId)) {
        this.moderationAudit.delete(id);
      }
    }
    for (const [id, p] of this.pushSubscriptions) {
      if (memberIds.has(p.memberId)) this.pushSubscriptions.delete(id);
    }
    for (const [id, r] of this.emailPlusVpcRequests) {
      if (r.familyId === familyId) this.emailPlusVpcRequests.delete(id);
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
