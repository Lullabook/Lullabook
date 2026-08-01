/**
 * A Character-only Brief must not ask for Persona IDs it hasn't got.
 *
 * Live-audit finding (2026-07-31): generating a Storybook from a Brief whose
 * cast is Characters only (no Personas) failed at the contract check:
 *
 *   Scenes may use selected Persona IDs only
 *
 * `validateGeneratedStoryContract` rejects any `scenes[].personaIds` entry not
 * in the selected set (`anthropic.ts`) — a real likeness boundary, since a
 * Persona ID in a Scene is what routes a real person's LoRA into an
 * illustration. It is correct and must stay.
 *
 * The defect is upstream, in the prompt. `castLine` emits a CAST PERSONA IDS
 * line only when `personaIds` is non-empty, so a Character-only Brief tells the
 * model nothing about the field — and the schema still requires it, so the
 * model fills it in with invented values. Every Character-only generation then
 * died on a validation the model was never told how to satisfy.
 *
 * This blocks PRD v19's "Placeholder art": a Character-only / persona-free
 * Brief is supposed to yield a text-viewable draft, never a failure.
 *
 * Fix: say so explicitly. When there are no Persona IDs, instruct an empty
 * `personaIds` on every Scene. The invariant is unchanged — the prompt just
 * stops steering the model into violating it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateGeneratedStoryContract } from "@/adapters/anthropic";
import type { GeneratedStory } from "@/domain/types";

const SRC = readFileSync(path.join(process.cwd(), "src/adapters/anthropic.ts"), "utf8");

function story(personaIdsPerScene: string[][]): GeneratedStory {
  return {
    text: "Once upon a time.",
    pages: personaIdsPerScene.map((_, index) => ({ index, text: `Page ${index}.` })),
    scenes: personaIdsPerScene.map((personaIds, pageIndex) => ({
      pageIndex,
      description: `Scene ${pageIndex}.`,
      personaIds,
    })),
    styleBible: { palette: "dusk purple", artStyle: "storybook", wardrobe: {} },
  } as GeneratedStory;
}

describe("Character-only cast — empty personaIds", () => {
  it("the prompt tells the model to leave personaIds empty when there are no Personas", () => {
    // The instruction must be emitted on the no-Persona branch, so the model
    // knows what to put in a field the schema still requires.
    expect(SRC).toMatch(/personaIds must be (an )?empty/i);
  });

  it("an empty personaIds passes the contract with no selected Personas", () => {
    expect(() =>
      validateGeneratedStoryContract(story([[], [], []]), 3, []),
    ).not.toThrow();
  });

  it("the likeness boundary still holds — an unselected Persona ID is rejected", () => {
    expect(() =>
      validateGeneratedStoryContract(story([[], ["persona-not-selected"], []]), 3, []),
    ).toThrow(/selected Persona IDs only/);
  });
});
