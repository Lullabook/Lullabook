import { describe, expect, it } from "vitest";
import { bookHref, resumeHref } from "@/lib/book-nav";

describe("48 — status-aware storybook routing", () => {
  it("routes finalized books to the reader", () => {
    expect(bookHref("finalized", "abc")).toBe("/storybooks/abc/read");
  });

  it("routes draft books to the detail/curation surface, not the reader", () => {
    expect(bookHref("draft", "abc")).toBe("/storybooks/abc");
    expect(bookHref("draft", "abc")).not.toContain("/read");
  });

  it("routes generating and failed books to the detail surface", () => {
    expect(bookHref("generating", "abc")).toBe("/storybooks/abc");
    expect(bookHref("failed", "abc")).toBe("/storybooks/abc");
  });

  it("resume reading targets the reader with an optional page", () => {
    expect(resumeHref("abc")).toBe("/storybooks/abc/read");
    expect(resumeHref("abc", 4)).toBe("/storybooks/abc/read?page=4");
  });
});
