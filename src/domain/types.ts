export type MemberRole = "guardian" | "member";

export type PersonaKind = "baby" | "adult";

export type PersonaStatus = "training" | "ready" | "failed";

export type StoryType =
  | "everyday"
  | "milestone"
  | "adventure"
  | "lesson"
  | "bedtime"
  | "silly"
  | "learning"; // legacy alias → lesson

export type RosterScope = "shared" | "isolated";

export type StorybookStatus = "generating" | "draft" | "finalized" | "failed";

export type SubscriptionStatus = "none" | "active" | "canceled" | "past_due";

/** Paid tier per ADR-0023 (Basic $8 / Normal $15 / Plus $25). */
export type Tier = "basic" | "normal" | "plus";

export type PageGenerationStatus = "pending" | "ready" | "quarantined" | "failed";

export interface Family {
  id: string;
  createdAt: Date;
}

export interface Member {
  id: string;
  authUserId: string;
  familyId: string;
  email: string;
  role: MemberRole;
  selfPersonaId: string | null;
  selectedBabyId: string | null;
  jurisdiction: string;
  createdAt: Date;
}

/** Invite lifecycle status (ADR-0024). */
export type InviteStatus = "pending" | "accepted" | "expired";

/**
 * ADR-0024 — Household invite. Opaque single-use token, expiry, fixed `member`
 * role (never attacker-chosen). Guardian-only creation; acceptance consumes the
 * token and creates the invitee as a non-Guardian Member in the inviter's
 * Household.
 */
export interface Invite {
  id: string;
  familyId: string;
  email: string;
  invitedBy: string;
  /** Opaque single-use secret, distinct from the PK. */
  token: string;
  role: "member";
  status: InviteStatus;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  /** Auth user id of the acceptor (set on accept). */
  acceptedByAuthUserId: string | null;
}

/** Household account boundary (internal: `Family`). One or more Babies. */
export interface Baby {
  id: string;
  familyId: string;
  displayName: string;
  /** Calendar date YYYY-MM-DD for birthday-story offers (issue 64). */
  birthDate: string | null;
  /** Parent-editable daily schedule; null → app default. */
  dailyRoutine: import("./daily-types").RoutineEntry[] | null;
  rosterGroupId: string;
  rosterScope: RosterScope;
  isDefault: boolean;
  createdAt: Date;
}

/** Per baby–person relationship + nicknames (issue 35). */
export interface BabyPersonBond {
  id: string;
  babyId: string;
  personaId: string;
  relationship: string;
  babyCallsThem: string;
  theyCallBaby: string;
}

export interface VoiceClip {
  id: string;
  familyId: string;
  personaId: string;
  label: string;
  transcript: string;
  durationSecs: number;
  blobKey: string;
  createdAt: Date;
}

export interface VoiceConsentReceipt {
  id: string;
  familyId: string;
  personaId: string;
  memberId: string;
  jurisdiction: string;
  noticeVersion: string;
  consentedAt: Date;
  revokedAt?: Date;
}

/** Parent-logged Moment about a Baby (issue 50 / ADR-0019). */
export interface Moment {
  id: string;
  familyId: string;
  babyId: string;
  createdByMemberId: string;
  body: string;
  /** Calendar date YYYY-MM-DD. */
  occurredOn: string;
  isSignificant: boolean;
  /** UI category from the Daily capture form (design drop-in). */
  momentType: import("./daily-types").MomentType;
  createdAt: Date;
}

/** Who was present for a Moment (issue 51). */
export interface MomentPersonLink {
  id: string;
  momentId: string;
  personaId?: string;
  characterId?: string;
}

/** Per-Baby watermark for auto-context "since last Story" (ADR-0019). */
export interface BabyAutoContextWatermark {
  babyId: string;
  /** Null until the first successful Story text generation. */
  lastStoryAt: Date | null;
}

/** Per-Baby rolling continuity/anti-repeat summary of a finalized Story (issue 90). */
export interface BabyPastStorySummary {
  id: string;
  familyId: string;
  babyId: string;
  storybookId: string;
  /** Bounded text: theme + cast + a truncated beats excerpt. No raw photo data. */
  summary: string;
  createdAt: Date;
}

export type JournalNudgeKind = "daily_dismiss" | "weekly_seen";

/** Per-member per-Baby nudge suppression (issues 53, 55). */
export interface JournalNudgeState {
  id: string;
  memberId: string;
  babyId: string;
  kind: JournalNudgeKind;
  /** Calendar date or week-start Monday YYYY-MM-DD. */
  suppressedOn: string;
  createdAt: Date;
}

export interface Persona {
  id: string;
  familyId: string;
  createdByMemberId: string;
  kind: PersonaKind;
  displayName: string;
  status: PersonaStatus;
  loraWeightKey: string | null;
  /** Generated roster portrait blob key; null ⇒ placeholder (ADR-0020). */
  avatarKey: string | null;
  promotedFromCharacterId?: string;
  questionnaire?: TraitQuestionnaire;
  createdAt: Date;
}

export interface ConsentReceipt {
  id: string;
  familyId: string;
  memberId: string;
  jurisdiction: string;
  noticeVersion: string;
  consentedAt: Date;
}

export interface TraitQuestionnaire {
  name: string;
  nickname?: string;
  relationships?: string[];
  favoriteAnimals?: string[];
  favoriteToys?: string[];
  songs?: string[];
  topics?: string[];
  isFictional: boolean;
}

export interface Character {
  id: string;
  familyId: string;
  createdByMemberId: string;
  displayName: string;
  /** Engine-generated 1–2 sentence blurb from the Trait Questionnaire (issue 46). */
  description: string;
  questionnaire: TraitQuestionnaire;
  promotedPersonaId?: string;
  createdAt: Date;
}

export interface LightConsentReceipt {
  id: string;
  characterId: string;
  familyId: string;
  memberId: string;
  jurisdiction: string;
  noticeVersion: string;
  attestation: string;
  consentedAt: Date;
}

export interface Subscription {
  familyId: string;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  /** ADR-0023 paid tier; set by RevenueCat (issue 92). Undefined → Normal default for an active sub. */
  tier?: Tier;
  updatedAt: Date;
}

export interface Brief {
  starringPersonaIds: string[];
  starringCharacterIds?: string[];
  babyId?: string;
  storyType: StoryType;
  theme: string;
  setting?: string;
  note?: string;
  customStyleNote?: string;
  artStyle?: string;
  pageCount?: number;
  lullabyClipId?: string;
  voiceClipIds?: string[];
}

export interface TextStoryBrief {
  starringCharacterIds: string[];
  storyType: StoryType;
  theme: string;
  note?: string;
}

export interface TextStory {
  id: string;
  familyId: string;
  createdByMemberId: string;
  brief: TextStoryBrief;
  text: string;
  createdAt: Date;
}

export interface StyleBible {
  palette: string;
  wardrobe: Record<string, string>;
  artStyle: string;
}

export interface PageCandidate {
  id: string;
  pageId: string;
  kind: "text" | "image";
  content: string;
  selected: boolean;
  createdAt: Date;
}

export interface Page {
  id: string;
  storybookId: string;
  index: number;
  text: string;
  illustrationUrl: string | null;
  illustrationBlobKey: string | null;
  videoBlobKey: string | null;
  videoUrl: string | null;
  voiceClipId: string | null;
  generationStatus: PageGenerationStatus;
  personaCount: number;
}

export interface PersistedGeneration {
  storybookId: string;
  story: GeneratedStory;
  persistedAt: Date;
}

export interface Storybook {
  id: string;
  familyId: string;
  /** Baby whose World this storybook belongs to. */
  babyId?: string;
  createdByMemberId: string;
  status: StorybookStatus;
  brief: Brief;
  /** Set when this book is a Personalized Classic: the catalog source-tale id. */
  classicId?: string;
  styleBible: StyleBible | null;
  rerollBudgetRemaining: number;
  rerollCredits: number;
  createdAt: Date;
  finalizedAt: Date | null;
}

export interface ShareLink {
  id: string;
  storybookId: string;
  token: string;
  expiresAt: Date | null;
  passcodeHash: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ModerationAuditEntry {
  id: string;
  resourceType: string;
  resourceId: string;
  outcome: "allowed" | "blocked" | "quarantined";
  reason: string | null;
  createdAt: Date;
}

export interface PendingBrief {
  memberId: string;
  personaId: string;
  brief: Brief;
  submittedAt: Date;
}

export interface PushSubscription {
  id: string;
  memberId: string;
  expoPushToken: string;
  createdAt: Date;
}

export interface EmailPlusVpcRequest {
  id: string;
  familyId: string;
  memberId: string;
  email: string;
  status: "requested" | "link_sent" | "confirmed" | "revoked";
  token: string;
  noticeVersion: string;
  requestedAt: Date;
  confirmedAt?: Date;
}

export type ConsentMethod = "payment_vpc" | "signed_form" | "otp" | "email_plus";

export type CharacterConsentMethod = "light_attestation" | ConsentMethod;

export interface JurisdictionConfig {
  code: string;
  childAgeThreshold: number;
  consentMethod: ConsentMethod;
  characterConsentMethod: CharacterConsentMethod;
  noticeVersion: string;
  residencyRegion: string;
  enabled: boolean;
}

export interface Scene {
  pageIndex: number;
  description: string;
  personaIds: string[];
}

export interface GeneratedStory {
  text: string;
  pages: { index: number; text: string }[];
  scenes: Scene[];
  styleBible: StyleBible;
}

/** A Plus-tier trained Style LoRA bound to a Household (issue 95 / ADR-0023). */
export type CustomStyleStatus = "generating" | "ready" | "failed";

export interface CustomStyle {
  id: string;
  familyId: string;
  createdByMemberId: string;
  seed: string;
  status: CustomStyleStatus;
  loraWeightKey: string | null;
  createdAt: Date;
}
