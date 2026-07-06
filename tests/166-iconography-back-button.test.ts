import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Issue 166 — Iconography + navigation polish (Back button, role-correct symbols).
 *
 * QA: the Back button "doesn't look good" and the tab-bar / feature symbols
 * "look random / placed in a hurry." This test enforces:
 *
 * 1. **Back control** — the shared `BackPill` component uses the canon token
 *    set (pill radius, plum-tinted shadow, dusk-purple token). No per-screen
 *    ad-hoc `‹ Back` styling remains.
 * 2. **Role-correct symbol system** — every primary-surface symbol is
 *    role-correct and distinct from its neighbours. No duplicate/placeholder
 *    glyph (e.g. no two dashboard cards sharing a look with each other or
 *    with a tab that doesn't navigate there).
 * 3. **Learning uses 🎓** (not the placeholder 🌟) — coordinated with issue 164.
 */

const ROOT = process.cwd();
const mobile = (p: string) => join(ROOT, "mobile", p);
const read = (p: string) => readFileSync(p, "utf8");

describe("166 — Iconography + Back button polish", () => {
  describe("Back control — shared component with canon tokens", () => {
    const backPillSrc = read(mobile("components/BackPill.tsx"));

    it("is a single shared component (no per-screen ad-hoc ‹ Back styling)", () => {
      // BackPill is the one shared component, used via mayaStackHeader.
      // No screen should define its own back button inline.
      const screens = [
        "mobile/app/family/new.tsx",
        "mobile/app/billing.tsx",
        "mobile/app/(tabs)/stories/[id].tsx",
      ];
      for (const screen of screens) {
        const src = read(join(ROOT, screen));
        // Screens may USE BackPill via the stack header, but should not
        // define their own inline ‹ Back text or button.
        expect(src).not.toMatch(/‹\s*Back/);
      }
    });

    it("uses the pill radius token (R.pill)", () => {
      expect(backPillSrc).toMatch(/borderRadius:\s*R\.pill/);
    });

    it("uses the dusk-purple token (C.primary)", () => {
      expect(backPillSrc).toMatch(/C\.primary/);
    });

    it("has a plum-tinted shadow (shadowColor from the canon palette)", () => {
      // The Maya design system's card shadow uses shadowColor: "#3A2850"
      // (plum-tinted). BackPill should have a shadow from the same family.
      expect(backPillSrc).toMatch(/shadowColor/);
      expect(backPillSrc).toMatch(/#3A2850|shadowOpacity|shadowRadius|elevation/);
    });
  });

  describe("Tab bar — role-correct and distinct symbols", () => {
    const layoutSrc = read(mobile("app/(tabs)/_layout.tsx"));

    const tabEmojis: Record<string, string> = {};
    // Matches: name="index" ... tabBarIcon ... emoji="☀️"
    const tabRegex = /name="(\w+)"[\s\S]*?emoji="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = tabRegex.exec(layoutSrc)) !== null) {
      tabEmojis[match[1]] = match[2];
    }

    it("has exactly 5 tabs with distinct emoji", () => {
      const values = Object.values(tabEmojis);
      expect(values).toHaveLength(5);
      expect(new Set(values).size).toBe(5);
    });

    it("Home is ☀️ (warmth/morning)", () => {
      expect(tabEmojis["index"]).toBe("☀️");
    });

    it("Stories is 📚 (library of books)", () => {
      expect(tabEmojis["stories"]).toBe("📚");
    });

    it("Create is ✨ (sparkle/magic of creation)", () => {
      expect(tabEmojis["create"]).toBe("✨");
    });

    it("Family is 💛 (love/warmth)", () => {
      expect(tabEmojis["family"]).toBe("💛");
    });

    it("Settings is ⚙️ (gear/configuration)", () => {
      expect(tabEmojis["settings"]).toBe("⚙️");
    });
  });

  describe("World home dashboard — no duplicate glyphs between cards", () => {
    const homeSrc = read(mobile("app/(tabs)/index.tsx"));

    // Extract all emoji used in dashIconText / journalIconText.
    const iconRegex = /(?:dashIconText|journalIconText)>([^<]+)</g;
    const emojis: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = iconRegex.exec(homeSrc)) !== null) {
      emojis.push(m[1].trim());
    }

    it("the Journal hero and Continue-reading cards use different glyphs (no 📖 duplication)", () => {
      // Previously both used 📖. Now they should be distinct.
      const unique = new Set(emojis);
      expect(unique.size).toBe(emojis.length);
    });

    it("the What-happened-today card does not reuse the Create tab's ✨", () => {
      // Previously this card used ✨, same as the Create tab. It should now
      // use a different glyph (e.g. ✍️ for capturing/writing).
      expect(emojis).not.toContain("✨");
    });
  });

  describe("Create story-type pills — Learning uses 🎓", () => {
    const createSrc = read(mobile("app/(tabs)/create/index.tsx"));

    it("Learning uses 🎓 (graduation cap — role-correct for learning)", () => {
      expect(createSrc).toMatch(/key:\s*["']learning["'].*icon:\s*["']🎓["']/s);
    });

    it("Learning does NOT use the placeholder 🌟", () => {
      // 🌟 was the placeholder; it's now the Milestone Moment type's icon.
      // The Learning story type should not share it.
      expect(createSrc).not.toMatch(/key:\s*["']learning["'].*icon:\s*["']🌟["']/s);
    });

    it("Bedtime uses 🌙 (moon — distinct from Learning)", () => {
      expect(createSrc).toMatch(/key:\s*["']bedtime["'].*icon:\s*["']🌙["']/s);
    });
  });
});
