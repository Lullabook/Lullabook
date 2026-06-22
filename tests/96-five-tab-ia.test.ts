import { describe, expect, it } from "vitest";
import { FIVE_TABS, tabForPath } from "@/components/nav-links";

describe("96 — 5-tab information architecture", () => {
  describe("the five tabs", () => {
    it("has exactly five tabs: Home, Stories, Create, Family, Settings", () => {
      expect(FIVE_TABS).toHaveLength(5);
      expect(FIVE_TABS.map((t) => t.label)).toEqual([
        "Home",
        "Stories",
        "Create",
        "Family",
        "Settings",
      ]);
    });

    it("each tab has an href and icon", () => {
      for (const tab of FIVE_TABS) {
        expect(tab.href).toBeTruthy();
        expect(tab.icon).toBeTruthy();
      }
    });

    it("Home routes to /world (the baby-hero dashboard)", () => {
      expect(FIVE_TABS[0].href).toBe("/world");
    });

    it("Stories routes to /stories", () => {
      expect(FIVE_TABS[1].href).toBe("/stories");
    });

    it("Create routes to /storybooks/new", () => {
      expect(FIVE_TABS[2].href).toBe("/storybooks/new");
    });

    it("Family routes to /family", () => {
      expect(FIVE_TABS[3].href).toBe("/family");
    });

    it("Settings routes to /account", () => {
      expect(FIVE_TABS[4].href).toBe("/account");
    });
  });

  describe("no 'More' tab", () => {
    it("the flat 'More' tab does not exist", () => {
      expect(FIVE_TABS.find((t) => t.label === "More")).toBeUndefined();
    });

    it("Characters is reachable under Family (not a top-level tab)", () => {
      expect(FIVE_TABS.find((t) => t.href === "/characters")).toBeUndefined();
    });

    it("Daily Life is reachable under Home (not a top-level tab)", () => {
      expect(FIVE_TABS.find((t) => t.href === "/daily")).toBeUndefined();
    });
  });

  describe("tabForPath — active tab resolution", () => {
    it("returns 'Home' for /world and /library", () => {
      expect(tabForPath("/world")).toBe("Home");
      expect(tabForPath("/library")).toBe("Home");
      expect(tabForPath("/daily")).toBe("Home");
    });

    it("returns 'Stories' for /stories and /storybooks (not /storybooks/new)", () => {
      expect(tabForPath("/stories")).toBe("Stories");
      expect(tabForPath("/storybooks/abc")).toBe("Stories");
      expect(tabForPath("/storybooks/abc/read")).toBe("Stories");
    });

    it("returns 'Create' for /storybooks/new", () => {
      expect(tabForPath("/storybooks/new")).toBe("Create");
    });

    it("returns 'Family' for /family and /characters and /personas", () => {
      expect(tabForPath("/family")).toBe("Family");
      expect(tabForPath("/characters")).toBe("Family");
      expect(tabForPath("/personas")).toBe("Family");
    });

    it("returns 'Settings' for /account and /billing", () => {
      expect(tabForPath("/account")).toBe("Settings");
      expect(tabForPath("/billing")).toBe("Settings");
    });

    it("returns null for unknown/legacy deep links (no white screen)", () => {
      expect(tabForPath("/unknown")).toBeNull();
    });
  });
});
