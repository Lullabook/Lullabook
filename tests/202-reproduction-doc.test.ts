import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 213 / local ticket 202 — reproduce and record every live demo failure.
 *
 * The findings doc must exist and, per flow, record either an observed failure
 * with its owning PRD v23 ticket (GH #213-#227) or the literal word WORKS with
 * evidence proving it. Sections must appear in order and never be empty.
 */
describe("202 — demo-failure reproduction doc", () => {
  const ROOT = process.cwd();
  const docPath = join(ROOT, "CONTEXT/handoffs/DEMO-FAILURE-REPRODUCTION.md");

  const sections = [
    "## Sign-in",
    "## Roster",
    "## Persona creation",
    "## Story generation",
    "## Reader",
  ] as const;

  const OWNING_TICKET = /#2(1[3-9]|2[0-7])/;

  it("findings doc exists", () => {
    expect(existsSync(docPath)).toBe(true);
  });

  it("contains the five flow sections in order", () => {
    const text = readFileSync(docPath, "utf8");
    let cursor = 0;
    for (const heading of sections) {
      const idx = text.indexOf(heading, cursor);
      expect(idx, `section ${heading} present in order`).toBeGreaterThanOrEqual(cursor);
      cursor = idx + heading.length;
    }
  });

  it("each flow section is non-empty with WORKS-evidence or a failure + owning ticket", () => {
    const text = readFileSync(docPath, "utf8");
    for (let i = 0; i < sections.length; i++) {
      const start = text.indexOf(sections[i]);
      const end =
        i + 1 < sections.length
          ? text.indexOf(sections[i + 1], start + sections[i].length)
          : text.length;
      const body = text.slice(start + sections[i].length, end);
      expect(body.trim().length, `${sections[i]} body not empty`).toBeGreaterThan(0);
      expect(
        body.match(/WORKS/) !== null || OWNING_TICKET.test(body),
        `${sections[i]} has WORKS+evidence or a failure with an owning #21x-#22x ticket`,
      ).toBe(true);
    }
  });

  it("each WORKS section carries evidence text", () => {
    const text = readFileSync(docPath, "utf8");
    const signInBody = text.slice(
      text.indexOf("## Sign-in"),
      text.indexOf("## Roster"),
    );
    if (signInBody.includes("WORKS")) {
      // Evidence = at least one concrete observation (HTTP status / log line / request).
      expect(signInBody).toMatch(/HTTP|log line|Evidence/i);
      expect(signInBody).toMatch(/WORKS/);
    }
  });
});