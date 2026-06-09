import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { Brief, Member } from "@/domain/types";

export class FamilyService {
  constructor(private readonly store: DataStore) {}

  inviteMember(guardianMemberId: string, email: string): { inviteId: string } {
    const guardian = this.store.members.get(guardianMemberId);
    if (!guardian || guardian.role !== "guardian") {
      throw new Error("Only guardians may invite members");
    }
    const inviteId = uuid();
    this.store.invites.set(inviteId, {
      id: inviteId,
      familyId: guardian.familyId,
      email,
      invitedBy: guardianMemberId,
    });
    return { inviteId };
  }

  acceptInvite(inviteId: string, authUserId: string): Member {
    const invite = this.store.invites.get(inviteId);
    if (!invite) throw new Error("Invite not found");
    const member = this.store.createMember({
      authUserId,
      familyId: invite.familyId,
      email: invite.email,
      role: "member",
      selfPersonaId: null,
      jurisdiction: "US",
    });
    this.store.invites.delete(inviteId);
    return member;
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
      theme: "adventure",
    };
  }
}
