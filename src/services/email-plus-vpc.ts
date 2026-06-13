import { randomUUID } from "node:crypto";
import type { NotificationAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { ConsentReceipt, EmailPlusVpcRequest } from "@/domain/types";
import { ConsentEngine } from "@/services/consent-engine";

export class EmailPlusVpcService {
  private readonly consentEngine = new ConsentEngine();

  constructor(
    private readonly store: DataStore,
    private readonly notifications: NotificationAdapter,
    private readonly appUrl: string
  ) {}

  requestConsent(memberId: string, email: string): EmailPlusVpcRequest {
    const member = this.store.members.get(memberId);
    if (!member || member.role !== "guardian") {
      throw new Error("Only guardians may request Email-Plus VPC");
    }
    const config = ConsentEngine.getJurisdiction(member.jurisdiction);
    if (!config) throw new Error("Unknown jurisdiction");
    if (config.consentMethod !== "email_plus") {
      throw new Error("Email-Plus VPC is not configured for this jurisdiction");
    }

    const request: EmailPlusVpcRequest = {
      id: randomUUID(),
      familyId: member.familyId,
      memberId: member.id,
      email,
      status: "requested",
      token: randomUUID(),
      noticeVersion: config.noticeVersion,
      requestedAt: new Date(),
    };
    this.store.emailPlusVpcRequests.set(request.id, request);
    return request;
  }

  async sendConsentLink(requestId: string): Promise<EmailPlusVpcRequest> {
    const request = this.store.emailPlusVpcRequests.get(requestId);
    if (!request) throw new Error("VPC request not found");
    const link = `${this.appUrl}/consent/email-plus?token=${request.token}`;
    await this.notifications.sendEmail(
      request.email,
      "Confirm parental consent for Lullabook",
      `Open this link to review what we collect and confirm consent:\n${link}\n\nNotice version: ${request.noticeVersion}`
    );
    request.status = "link_sent";
    this.store.emailPlusVpcRequests.set(request.id, request);
    return request;
  }

  confirmConsent(token: string): ConsentReceipt {
    const request = [...this.store.emailPlusVpcRequests.values()].find(
      (r) => r.token === token && r.status === "link_sent"
    );
    if (!request) throw new Error("Invalid or expired consent link");

    request.status = "confirmed";
    request.confirmedAt = new Date();
    this.store.emailPlusVpcRequests.set(request.id, request);

    const receipt: ConsentReceipt = {
      id: randomUUID(),
      familyId: request.familyId,
      memberId: request.memberId,
      jurisdiction: this.store.members.get(request.memberId)?.jurisdiction ?? "US_IOS",
      noticeVersion: request.noticeVersion,
      consentedAt: new Date(),
    };
    this.store.saveConsentReceipt(receipt);
    return receipt;
  }

  async sendDelayedConfirmation(requestId: string): Promise<void> {
    const request = this.store.emailPlusVpcRequests.get(requestId);
    if (!request || request.status !== "confirmed") return;
    const revokeLink = `${this.appUrl}/consent/email-plus/revoke?token=${request.token}`;
    await this.notifications.sendEmail(
      request.email,
      "Your Lullabook consent confirmation",
      `You confirmed parental consent on ${request.confirmedAt?.toISOString()}.\n\nTo revoke consent, open:\n${revokeLink}`
    );
  }

  revokeConsent(token: string): void {
    const request = [...this.store.emailPlusVpcRequests.values()].find((r) => r.token === token);
    if (!request) throw new Error("Invalid revoke link");
    if (request.status === "revoked") {
      throw new Error("Consent already revoked");
    }
    if (request.status !== "confirmed") {
      throw new Error("Consent not yet confirmed");
    }

    request.status = "revoked";
    this.store.emailPlusVpcRequests.set(request.id, request);
    for (const [id, receipt] of this.store.consentReceipts) {
      if (receipt.familyId === request.familyId) {
        this.store.consentReceipts.delete(id);
      }
    }

    const hasBabyPersonas = [...this.store.personas.values()].some(
      (p) => p.familyId === request.familyId && p.kind === "baby"
    );
    if (hasBabyPersonas) {
      const purgeAt = new Date();
      purgeAt.setDate(purgeAt.getDate() + 30);
      this.store.purgeScheduled.set(request.familyId, {
        familyId: request.familyId,
        purgeAt,
      });
    }
  }

  hasVerifiedConsent(familyId: string): boolean {
    return !!this.store.getConsentReceiptForFamily(familyId);
  }
}
