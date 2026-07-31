import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
  createProviderBakeoffFixtureManifest,
  runProviderBakeoff,
  validateProviderBakeoffFixture,
  type ProviderBakeoffAdapters,
} from "@/services/provider-bakeoff";

function approvedConfig() {
  return {
    budgetUsd: 10,
    liveRunApproved: true as const,
    credentials: { fal: "credential", anthropic: "credential" },
  };
}

function unavailableAdapters(run: ReturnType<typeof vi.fn>): ProviderBakeoffAdapters {
  return {
    fal: {
      startTraining: async () => ({ jobId: "unused", status: "queued" }),
      submitTraining: async () => ({ jobId: "unused", status: "queued" }),
      generateImage: async () => ({ imageUrl: "unused" }),
      inpaintFaces: async () => ({ imageUrl: "unused" }),
      generateWithReferenceModel: async () => ({ imageUrl: "unused" }),
      runTraining: run,
      runGeneration: run,
      runRepair: run,
    },
    anthropic: {
      generateStory: async () => { throw new Error("unused"); },
      generateTextStory: async () => ({ text: "unused" }),
      adaptStory: async () => { throw new Error("unused"); },
      generateCharacterDescription: async () => ({ description: "unused" }),
      runStoryGeneration: run,
    },
  };
}

describe("176 — approved canary fixture integrity", () => {
  it("cryptographically binds the exact archive and Story golden set before provider access", async () => {
    const run = vi.fn();
    const tampered = {
      ...DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
      archiveBytes: Buffer.from("tampered archive"),
    };

    expect(() => validateProviderBakeoffFixture(tampered)).toThrow(/archive.*sha|digest/i);
    await expect(runProviderBakeoff({
      config: approvedConfig(),
      adapters: unavailableAdapters(run),
      fixture: tampered,
    })).rejects.toThrow(/archive.*sha|digest/i);
    expect(run).not.toHaveBeenCalled();
  });

  it("binds subject classification and refuses minors even when the bytes match", () => {
    const manifest = createProviderBakeoffFixtureManifest({
      goldenSetId: "minor-fixture",
      archiveSha256: DEFAULT_PROVIDER_BAKEOFF_FIXTURE.manifest.archiveSha256,
      goldenSetSha256: DEFAULT_PROVIDER_BAKEOFF_FIXTURE.manifest.goldenSetSha256,
      subjectClassification: "minor",
      consentProof: null,
    });

    expect(() => validateProviderBakeoffFixture({
      ...DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
      manifest,
    }, manifest.manifestSha256)).toThrow(/minor/i);
  });

  it("requires durable verified consent provenance for an adult fixture", () => {
    const manifest = createProviderBakeoffFixtureManifest({
      goldenSetId: "adult-fixture",
      archiveSha256: DEFAULT_PROVIDER_BAKEOFF_FIXTURE.manifest.archiveSha256,
      goldenSetSha256: DEFAULT_PROVIDER_BAKEOFF_FIXTURE.manifest.goldenSetSha256,
      subjectClassification: "consenting-adult",
      consentProof: null,
    });

    expect(() => validateProviderBakeoffFixture({
      ...DEFAULT_PROVIDER_BAKEOFF_FIXTURE,
      manifest,
    }, manifest.manifestSha256)).toThrow(/consent.*proof/i);
  });
});
