export type MemberRole = "guardian" | "member";

export type PersonaKind = "baby" | "adult";

export type PersonaStatus = "training" | "ready" | "failed";

export type StorybookStatus = "generating" | "draft" | "finalized";

export type SubscriptionStatus = "none" | "active" | "canceled" | "past_due";

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
  jurisdiction: string;
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

export interface Subscription {
  familyId: string;
  status: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  updatedAt: Date;
}

export interface Brief {
  starringPersonaIds: string[];
  theme: string;
  setting?: string;
  note?: string;
  customStyleNote?: string;
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
  generationStatus: PageGenerationStatus;
  personaCount: number;
}

export interface Storybook {
  id: string;
  familyId: string;
  createdByMemberId: string;
  status: StorybookStatus;
  brief: Brief;
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

export interface JurisdictionConfig {
  code: string;
  childAgeThreshold: number;
  consentMethod: "payment_vpc" | "signed_form" | "otp";
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
