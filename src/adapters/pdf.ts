import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PdfAdapter } from "@/adapters/types";

// DECISION: pdf-lib for Export — pure JS (no headless browser), runs in any
// serverless runtime, and a picture book is simple fixed-layout pages.
const PAGE_WIDTH = 595; // A4 portrait, points
const PAGE_HEIGHT = 842;
const MARGIN = 48;

export class PdfLibAdapter implements PdfAdapter {
  async generateStorybookPdf(storybook: {
    title: string;
    pages: { text: string; illustrationUrl: string }[];
  }): Promise<Buffer> {
    const doc = await PDFDocument.create();
    const serif = await doc.embedFont(StandardFonts.TimesRomanItalic);
    const body = await doc.embedFont(StandardFonts.TimesRoman);

    // Cover page.
    const cover = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    cover.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_WIDTH,
      height: PAGE_HEIGHT,
      color: rgb(0.118, 0.106, 0.235),
    });
    const titleSize = 32;
    const titleWidth = serif.widthOfTextAtSize(storybook.title, titleSize);
    cover.drawText(storybook.title, {
      x: Math.max(MARGIN, (PAGE_WIDTH - titleWidth) / 2),
      y: PAGE_HEIGHT / 2,
      size: titleSize,
      font: serif,
      color: rgb(0.97, 0.93, 0.86),
    });
    const subtitle = "A Lullabook keepsake";
    const subWidth = body.widthOfTextAtSize(subtitle, 12);
    cover.drawText(subtitle, {
      x: (PAGE_WIDTH - subWidth) / 2,
      y: PAGE_HEIGHT / 2 - 40,
      size: 12,
      font: body,
      color: rgb(0.78, 0.74, 0.88),
    });

    for (const page of storybook.pages) {
      const p = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      p.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        color: rgb(0.992, 0.973, 0.937),
      });

      let imageBottom = PAGE_HEIGHT - MARGIN;
      const illustration = await this.fetchIllustration(page.illustrationUrl);
      if (illustration) {
        try {
          const embedded = illustration.kind === "png"
            ? await doc.embedPng(illustration.bytes)
            : await doc.embedJpg(illustration.bytes);
          const maxWidth = PAGE_WIDTH - MARGIN * 2;
          const maxHeight = PAGE_HEIGHT * 0.6;
          const scale = Math.min(maxWidth / embedded.width, maxHeight / embedded.height);
          const w = embedded.width * scale;
          const h = embedded.height * scale;
          p.drawImage(embedded, {
            x: (PAGE_WIDTH - w) / 2,
            y: PAGE_HEIGHT - MARGIN - h,
            width: w,
            height: h,
          });
          imageBottom = PAGE_HEIGHT - MARGIN - h;
        } catch {
          // An unreadable illustration never blocks the keepsake export.
        }
      }

      const fontSize = 16;
      const lineHeight = fontSize * 1.6;
      const lines = wrapText(page.text, body, fontSize, PAGE_WIDTH - MARGIN * 2);
      let y = imageBottom - 56;
      for (const line of lines) {
        const lineWidth = body.widthOfTextAtSize(line, fontSize);
        p.drawText(line, {
          x: (PAGE_WIDTH - lineWidth) / 2,
          y,
          size: fontSize,
          font: body,
          color: rgb(0.2, 0.18, 0.3),
        });
        y -= lineHeight;
      }
    }

    return Buffer.from(await doc.save());
  }

  private async fetchIllustration(
    url: string
  ): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
    if (!url || !url.startsWith("http")) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const isPng =
        bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
      return { bytes, kind: isPng ? "png" : "jpg" };
    } catch {
      return null;
    }
  }
}

function wrapText(
  text: string,
  font: { widthOfTextAtSize(t: string, s: number): number },
  size: number,
  maxWidth: number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}
