import { createHash, randomBytes } from "node:crypto";
import { v4 as uuid } from "uuid";
import type { DataStore } from "@/db/store";
import type { ShareLink, Storybook } from "@/domain/types";

export class SharingService {
  constructor(private readonly store: DataStore) {}

  listVisibleStorybooks(actorMemberId: string): Storybook[] {
    const actor = this.store.members.get(actorMemberId);
    if (!actor) throw new Error("Member not found");
    return this.store.listStorybooksForFamily(actor.familyId, actorMemberId);
  }

  canViewStorybook(actorMemberId: string, storybookId: string): boolean {
    try {
      return !!this.store.getStorybook(storybookId, actorMemberId);
    } catch {
      return false;
    }
  }

  mintShareLink(
    actorMemberId: string,
    storybookId: string,
    options?: { expiresAt?: Date; passcode?: string }
  ): { link: ShareLink; warning: string; url: string } {
    const book = this.store.getStorybook(storybookId, actorMemberId);
    if (!book) throw new Error("Storybook not found");
    if (book.status !== "finalized") {
      throw new Error("Only finalized storybooks can be shared externally");
    }

    const warning =
      "This link exposes your child's likeness and name to anyone with the URL.";

    const token = randomBytes(16).toString("hex");
    const link: ShareLink = {
      id: uuid(),
      storybookId,
      token,
      expiresAt: options?.expiresAt ?? null,
      passcodeHash: options?.passcode
        ? createHash("sha256").update(options.passcode).digest("hex")
        : null,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.store.saveShareLink(link);

    return {
      link,
      warning,
      url: `/share/${token}`,
    };
  }

  accessViaShareLink(
    token: string,
    passcode?: string
  ): Storybook | null {
    const link = this.store.getShareLinkByToken(token);
    if (!link || link.revokedAt) return null;
    if (link.expiresAt && link.expiresAt < new Date()) return null;
    if (link.passcodeHash) {
      const hash = createHash("sha256").update(passcode ?? "").digest("hex");
      if (hash !== link.passcodeHash) return null;
    }
    const book = this.store.storybooks.get(link.storybookId);
    if (!book || book.status !== "finalized") return null;
    return book;
  }

  revokeShareLink(actorMemberId: string, linkId: string): void {
    const link = this.store.shareLinks.get(linkId);
    if (!link) throw new Error("Link not found");
    this.store.getStorybook(link.storybookId, actorMemberId);
    link.revokedAt = new Date();
    this.store.saveShareLink(link);
  }

  shareLinkHeaders(): Record<string, string> {
    return { "X-Robots-Tag": "noindex, nofollow" };
  }
}
