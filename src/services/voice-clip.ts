import { v4 as uuid } from "uuid";
import type { BlobStore, NotificationAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { VoiceClip, VoiceConsentReceipt } from "@/domain/types";
import type { EntitlementService } from "@/services/entitlement";
import { ConsentEngine } from "@/services/consent-engine";

export interface RecordVoiceClipInput {
  memberId: string;
  personaId: string;
  label: string;
  transcript: string;
  durationSecs: number;
  audioBytes: Buffer;
}

export class VoiceClipService {
  constructor(
    private readonly store: DataStore,
    private readonly blobs: BlobStore,
    private readonly entitlements: EntitlementService,
    private readonly consentEngine: ConsentEngine = new ConsentEngine(),
    private readonly notifications: NotificationAdapter | null = null
  ) {}

  recordConsent(memberId: string, personaId: string): VoiceConsentReceipt {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    const persona = this.store.getPersona(personaId, memberId);
    if (!persona || persona.kind !== "adult") {
      throw new Error("Voice consent applies to family members only");
    }

    const existing = this.store.getVoiceConsentForPersona(personaId);
    if (existing) return existing;

    const config = ConsentEngine.getJurisdiction(member.jurisdiction);
    if (!config) throw new Error("Unknown jurisdiction");

    const receipt: VoiceConsentReceipt = {
      id: uuid(),
      familyId: member.familyId,
      personaId,
      memberId: member.id,
      jurisdiction: member.jurisdiction,
      noticeVersion: config.noticeVersion,
      consentedAt: new Date(),
    };
    this.store.saveVoiceConsentReceipt(receipt);
    return receipt;
  }

  async uploadClip(input: RecordVoiceClipInput): Promise<VoiceClip> {
    const member = this.store.members.get(input.memberId);
    if (!member) throw new Error("Member not found");
    const persona = this.store.getPersona(input.personaId, input.memberId);
    if (!persona) throw new Error("Persona not found");

    // ADR-0023 / issue 91: narration (real-voice weave) is a Normal+
    // capability. A Basic Household cannot upload voice material — 403.
    this.entitlements.requireCapability(member.familyId, "narrate");

    const consent = this.store.getVoiceConsentForPersona(input.personaId);
    if (!consent) {
      throw new Error("Voice consent required before recording clips");
    }

    const clipId = uuid();
    const blobKey = `voice/${persona.id}/${clipId}.webm`;
    await this.blobs.put(blobKey, input.audioBytes);

    const clip: VoiceClip = {
      id: clipId,
      familyId: member.familyId,
      personaId: input.personaId,
      label: input.label,
      transcript: input.transcript,
      durationSecs: input.durationSecs,
      blobKey,
      createdAt: new Date(),
    };
    this.store.saveVoiceClip(clip);

    // Issue 115 / ADR-0024: a Voice message posts immediately and notifies the
    // parents (guardians) of the Household. Best-effort — a notification
    // failure does NOT block the post.
    if (this.notifications) {
      const guardians = [...this.store.members.values()].filter(
        (m) => m.familyId === member.familyId && m.role === "guardian" && m.id !== input.memberId
      );
      for (const g of guardians) {
        this.notifications
          .sendWebPush(
            g.id,
            "💛 New voice message",
            `A new voice clip "${input.label}" was added to the family.`
          )
          .catch(() => {});
      }
    }

    return clip;
  }

  listForPersona(memberId: string, personaId: string): VoiceClip[] {
    return this.store.getVoiceClipsForPersona(personaId, memberId);
  }

  async getPlaybackUrl(memberId: string, clipId: string): Promise<string> {
    const clip = this.store.getVoiceClip(clipId, memberId);
    if (!clip) throw new Error("Voice clip not found");
    if (this.blobs.signedUrl) {
      return this.blobs.signedUrl(clip.blobKey);
    }
    return `memory://${clip.blobKey}`;
  }

  async revokeConsent(memberId: string, personaId: string): Promise<void> {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    const consent = this.store.getVoiceConsentForPersona(personaId);
    if (!consent) throw new Error("No active voice consent");

    consent.revokedAt = new Date();
    this.store.saveVoiceConsentReceipt(consent);

    const clips = this.store.getVoiceClipsForPersona(personaId, memberId);
    for (const clip of clips) {
      await this.blobs.delete(clip.blobKey);
      this.store.deleteVoiceClip(clip.id);
    }

    this.store.saveModerationAudit({
      id: uuid(),
      resourceType: "voice_consent",
      resourceId: personaId,
      outcome: "allowed",
      reason: "revoked",
      createdAt: new Date(),
    });
  }
}
