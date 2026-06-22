import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Brief, Invite, Member } from "@/domain/types";
import type { NotificationAdapter } from "@/adapters/types";

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class FamilyService {
  constructor(
    private readonly store: DataStore,
    private readonly notifications: NotificationAdapter | null = null
  ) {}

  inviteMember(guardianMemberId: string, email: string): { inviteId: string; token: string } {
    const guardian = this.store.members.get(guardianMemberId);
    if (!guardian || guardian.role !== "guardian") {
      throw new Error("Only guardians may invite members");
    }
    const inviteId = uuid();
    const token = uuid() + uuid(); // opaque, distinct from PK
    const now = new Date();
    const invite: Invite = {
      id: inviteId,
      familyId: guardian.familyId,
      email,
      invitedBy: guardianMemberId,
      token,
      role: "member",
      status: "pending",
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_EXPIRY_MS),
      acceptedAt: null,
      acceptedByAuthUserId: null,
    };
    this.store.invites.set(inviteId, invite);

    // ADR-0024: send the invite email via the notification adapter (mirrors
    // the Email-Plus VPC token+confirm pattern). Best-effort — a notification
    // failure doesn't block the invite creation.
    if (this.notifications) {
      this.notifications
        .sendEmail(
          email,
          "You're invited to join the family on Lullabook",
          `Accept your invite: https://lullabook.app/invite?token=${token}`
        )
        .catch(() => {});
    }

    return { inviteId, token };
  }

  /**
   * ADR-0024 — Accept an invite by its opaque token. Consumes the token
   * (single-use), creates the invitee as a non-Guardian Member in the inviter's
   * Household, and takes precedence over auto-onboarding. Rejects
   * expired/used/forged tokens.
   */
  acceptInvite(token: string, authUserId: string): Member {
    const invite = [...this.store.invites.values()].find((i) => i.token === token);
    if (!invite) throw new Error("Invite not found");

    // Idempotent: if this auth user already accepted this invite, return them.
    if (invite.status === "accepted") {
      if (invite.acceptedByAuthUserId === authUserId) {
        const existing = [...this.store.members.values()].find(
          (m) => m.authUserId === authUserId && m.familyId === invite.familyId
        );
        if (existing) return existing;
      }
      throw new Error("Invite already used");
    }

    if (invite.expiresAt < new Date()) {
      invite.status = "expired";
      this.store.invites.set(invite.id, invite);
      throw new Error("Invite has expired");
    }

    const member = this.store.createMember({
      authUserId,
      familyId: invite.familyId,
      email: invite.email,
      role: "member",
      selfPersonaId: null,
      jurisdiction: "US",
    });

    invite.status = "accepted";
    invite.acceptedAt = new Date();
    invite.acceptedByAuthUserId = authUserId;
    this.store.invites.set(invite.id, invite);

    return member;
  }

  /** Look up a pending invite by token (for the accept UI). */
  getInviteByToken(token: string): Invite | undefined {
    return [...this.store.invites.values()].find((i) => i.token === token);
  }

  removeMember(guardianMemberId: string, targetMemberId: string): void {
    const guardian = this.store.members.get(guardianMemberId);
    if (!guardian || guardian.role !== "guardian") {
      throw new Error("Only guardians may remove members");
    }
    const target = this.store.members.get(targetMemberId);
    if (!target || target.familyId !== guardian.familyId) {
      throw new Error("Member not found in family");
    }
    if (target.role === "guardian") {
      throw new Error("Cannot remove the guardian");
    }
    this.store.members.delete(targetMemberId);
  }

  linkSelfPersona(memberId: string, personaId: string): Member {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    const persona = this.store.getPersona(personaId, memberId);
    if (!persona || persona.kind !== "adult") {
      throw new Error("Self persona must be an adult persona");
    }
    member.selfPersonaId = personaId;
    return member;
  }

  defaultBriefStarring(memberId: string, chosenPersonaIds: string[]): Brief {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");
    const starring = member.selfPersonaId
      ? [member.selfPersonaId, ...chosenPersonaIds.filter((id) => id !== member.selfPersonaId)]
      : chosenPersonaIds;
    return {
      starringPersonaIds: starring,
      storyType: "bedtime",
      theme: "adventure",
    };
  }
}
