import { v4 as uuid } from "uuid";
import type { ModerationAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";

export class ChildSafetyService {
  constructor(
    private readonly store: DataStore,
    private readonly moderation: ModerationAdapter
  ) {}

  async checkUpload(image: Buffer, resourceId: string): Promise<void> {
    const result = await this.moderation.checkImage(image);
    this.store.saveModerationAudit({
      id: uuid(),
      resourceType: "upload",
      resourceId,
      outcome: result.allowed ? "allowed" : "blocked",
      reason: result.reason ?? null,
      createdAt: new Date(),
    });
    if (!result.allowed) {
      if (result.csamDetected) {
        this.store.saveModerationAudit({
          id: uuid(),
          resourceType: "ncmec_report",
          resourceId,
          outcome: "blocked",
          reason: "NCMEC reporting path triggered",
          createdAt: new Date(),
        });
      }
      throw new Error(result.reason ?? "Upload blocked by moderation");
    }
  }

  async checkText(text: string, resourceId: string): Promise<void> {
    const result = await this.moderation.checkText(text);
    this.store.saveModerationAudit({
      id: uuid(),
      resourceType: "text",
      resourceId,
      outcome: result.allowed ? "allowed" : "blocked",
      reason: result.reason ?? null,
      createdAt: new Date(),
    });
    if (!result.allowed) {
      throw new Error(result.reason ?? "Text blocked by moderation");
    }
  }

  async checkGeneratedImage(imageUrl: string): Promise<"allowed" | "quarantined"> {
    const result = await this.moderation.checkText(imageUrl);
    this.store.saveModerationAudit({
      id: uuid(),
      resourceType: "generated_image",
      resourceId: imageUrl,
      outcome: result.allowed ? "allowed" : "quarantined",
      reason: result.reason ?? null,
      createdAt: new Date(),
    });
    return result.allowed ? "allowed" : "quarantined";
  }

  reportAbuse(reporterId: string, targetId: string, reason: string): void {
    this.store.saveModerationAudit({
      id: uuid(),
      resourceType: "abuse_report",
      resourceId: targetId,
      outcome: "blocked",
      reason: `Reported by ${reporterId}: ${reason}`,
      createdAt: new Date(),
    });
  }

  banAccount(accountId: string): void {
    this.store.bannedAccounts.add(accountId);
  }

  isBanned(accountId: string): boolean {
    return this.store.bannedAccounts.has(accountId);
  }
}
