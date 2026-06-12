import type { PdfAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";

export class ExportService {
  constructor(
    private readonly store: DataStore,
    private readonly pdf: PdfAdapter,
    /** Turns a Page's blob key into a fetchable URL (signed, short-lived). */
    private readonly resolveBlobUrl?: (key: string) => Promise<string>
  ) {}

  async exportPdf(actorMemberId: string, storybookId: string): Promise<Buffer> {
    const book = this.store.getStorybook(storybookId, actorMemberId);
    if (!book) throw new Error("Storybook not found");
    if (book.status !== "finalized") {
      throw new Error("Only finalized storybooks can be exported");
    }

    const pages = this.store.getPagesForStorybook(storybookId);
    const pdfPages = await Promise.all(
      pages.map(async (p) => ({
        text: p.text,
        illustrationUrl:
          p.illustrationBlobKey && this.resolveBlobUrl
            ? await this.resolveBlobUrl(p.illustrationBlobKey)
            : (p.illustrationBlobKey ?? p.illustrationUrl ?? ""),
      }))
    );
    return this.pdf.generateStorybookPdf({
      title: book.brief.theme,
      pages: pdfPages,
    });
  }
}
