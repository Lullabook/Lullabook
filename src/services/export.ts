import type { PdfAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";

export class ExportService {
  constructor(
    private readonly store: DataStore,
    private readonly pdf: PdfAdapter
  ) {}

  async exportPdf(actorMemberId: string, storybookId: string): Promise<Buffer> {
    const book = this.store.getStorybook(storybookId, actorMemberId);
    if (!book) throw new Error("Storybook not found");
    if (book.status !== "finalized") {
      throw new Error("Only finalized storybooks can be exported");
    }

    const pages = this.store.getPagesForStorybook(storybookId);
    return this.pdf.generateStorybookPdf({
      title: book.brief.theme,
      pages: pages.map((p) => ({
        text: p.text,
        illustrationUrl: p.illustrationUrl ?? "",
      })),
    });
  }
}
