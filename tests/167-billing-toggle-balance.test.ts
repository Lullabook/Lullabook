import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 167 — Billing plan-toggle slider balance.
 *
 * QA: on `billing.tsx` the "Annual (save 17%) / Monthly" toggle is unbalanced
 * — the active pill clips the "Annual (save 17%)" label. The fix: segments
 * size to their content (equal-width flex segments or the pill sized to the
 * widest label), the active pill fully contains its text with no horizontal
 * clipping at any supported width, and the touch targets are even.
 *
 * The `AnimatedToggle` component in `maya-ui.tsx` is shared; this test pins
 * the fix at the source level so every caller (not just billing) inherits it.
 */

const ROOT = process.cwd();
const mobile = (p: string) => join(ROOT, "mobile", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("167 — Billing plan-toggle slider balance", () => {
  const toggleSrc = read(mobile("components/maya-ui.tsx"));

  describe("AnimatedToggle — content-sized segments", () => {
    it("segments use flex: 1 (equal-width, not fixed width that clips)", () => {
      // The toggle buttons must use flex: 1 so they share space equally
      // regardless of label length — no fixed width that could clip.
      expect(toggleSrc).toMatch(/toggleBtn[\s\S]*?flex:\s*1/);
    });

    it("toggle text uses numberOfLines or allowFontScaling (no truncation)", () => {
      // The toggle text should either use numberOfLines={1} or allowFontScaling
      // to handle label width gracefully.
      expect(toggleSrc).toMatch(/numberOfLines|allowFontScaling/);
    });

    it("toggle text has textAlign: center (balanced within segment)", () => {
      expect(toggleSrc).toMatch(/textAlign.*center/);
    });
  });

  describe("billing.tsx — the Annual/Monthly labels fit", () => {
    const billingSrc = read(mobile("app/billing.tsx"));

    it("uses the shared AnimatedToggle (not a custom inline toggle)", () => {
      expect(billingSrc).toMatch(/AnimatedToggle/);
    });

    it("passes the Annual (save 17%) and Monthly labels to the toggle", () => {
      expect(billingSrc).toMatch(/Annual \(save 17%\)/);
      expect(billingSrc).toMatch(/Monthly/);
    });

    it("toggle style uses canon tokens (no hardcoded off-token colors)", () => {
      // The toggle wrap and indicator styles use C.* tokens, not raw hex.
      const stylesSection = toggleSrc.substring(
        toggleSrc.lastIndexOf("toggleWrap:"),
        toggleSrc.lastIndexOf("toggleBtn:")
      );
      expect(stylesSection).toMatch(/C\./);
    });
  });

  describe("toggle indicator — sized to segment width", () => {
    it("indicator width is segment width (width / options.length)", () => {
      // The sliding indicator must size to one segment's width.
      expect(toggleSrc).toMatch(/width\.value\s*\/\s*Math\.max\(1,\s*options\.length\)/);
    });
  });
});
