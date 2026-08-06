import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MOBILE = join(process.cwd(), "mobile");

/**
 * Issue 206 — free-team entitlement flag (local ticket 198, invariant S1).
 *
 * Only the exact string "1" enables the free-team branch. Unset and every
 * other value (including "true") must resolve byte-for-byte to the production
 * configuration: expo-apple-authentication present, associatedDomains present.
 */
async function resolveConfig(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key];
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
  const { vi } = await import("vitest");
  vi.resetModules();
  const mod = (await import(`${MOBILE}/app.config.ts`)) as {
    default: {
      ios?: { associatedDomains?: string[]; bundleIdentifier?: string };
      scheme?: string;
      plugins: (string | [string, unknown])[];
    };
  };
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return mod.default;
}

const pluginNames = (config: { plugins: (string | [string, unknown])[] }) =>
  config.plugins.map((entry) => (typeof entry === "string" ? entry : entry[0]));

describe("198 — free-team entitlement flag (issue 206)", () => {
  it("unset LULLABOOK_FREE_TEAM resolves the production config", async () => {
    const config = await resolveConfig({ LULLABOOK_FREE_TEAM: undefined });
    expect(pluginNames(config)).toContain("expo-apple-authentication");
    expect(config.ios?.associatedDomains).toEqual(["applinks:lullabook.app"]);
  });

  it('LULLABOOK_FREE_TEAM="1" omits both free-team-blocked entitlements', async () => {
    const config = await resolveConfig({ LULLABOOK_FREE_TEAM: "1" });
    expect(pluginNames(config)).not.toContain("expo-apple-authentication");
    expect(config.ios?.associatedDomains).toBeUndefined();
  });

  it('LULLABOOK_FREE_TEAM="1" leaves identity, scheme, and other plugins untouched', async () => {
    const config = await resolveConfig({ LULLABOOK_FREE_TEAM: "1" });
    expect(config.ios?.bundleIdentifier).toBe("com.lullabook.app");
    expect(config.scheme).toBe("com.lullabook");
    expect(pluginNames(config)).toEqual(
      expect.arrayContaining(["expo-router", "expo-secure-store", "expo-splash-screen"])
    );
  });

  it('LULLABOOK_FREE_TEAM="true" matches the unset case exactly', async () => {
    const unset = await resolveConfig({ LULLABOOK_FREE_TEAM: undefined });
    const truthy = await resolveConfig({ LULLABOOK_FREE_TEAM: "true" });
    expect(JSON.stringify(truthy)).toBe(JSON.stringify(unset));
    expect(pluginNames(truthy)).toContain("expo-apple-authentication");
    expect(truthy.ios?.associatedDomains).toEqual(["applinks:lullabook.app"]);
  });

  it("mobile/.env.example documents the flag with a production warning", () => {
    const example = readFileSync(join(MOBILE, ".env.example"), "utf8");
    expect(example).toContain("LULLABOOK_FREE_TEAM");
    expect(example).toMatch(/never/i);
  });
});
