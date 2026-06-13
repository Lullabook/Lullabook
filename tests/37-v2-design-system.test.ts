import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { V2_COLORS, V2_FONTS } from "@/components/v2/tokens";

describe("37 — v2 design system tokens", () => {
  it("exports shared warm daytime tokens matching the prototype", () => {
    expect(V2_COLORS.background).toBe("#FBF4E7");
    expect(V2_COLORS.primary).toBe("#6A55C9");
    expect(V2_COLORS.accent).toBe("#E79A3C");
    expect(V2_FONTS.display).toContain("Baloo 2");
    expect(V2_FONTS.body).toContain("Nunito");
  });

  it("applies v2 shell styles in globals.css", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toContain("--v2-bg");
    expect(css).toContain(".v2-shell");
    expect(css).toContain(".v2-nav");
  });

  it("uses v2 layout for authed routes", () => {
    const layout = readFileSync(join(process.cwd(), "src/app/(app)/layout.tsx"), "utf8");
    const shell = readFileSync(join(process.cwd(), "src/components/v2/app-shell.tsx"), "utf8");
    expect(layout).toContain("AppShell");
    expect(shell).toContain("v2-shell");
  });
});
