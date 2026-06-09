import { v4 as uuid } from "uuid";
import type { AnthropicAdapter, FalAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { Brief, Storybook } from "@/domain/types";
import { ChildSafetyService } from "@/services/child-safety";

const FREE_REROLL_BUDGET = 5;
const PAGE_COUNT = 12;

export class StorybookService {
  constructor(
    private readonly store: DataStore,
    private readonly anthropic: AnthropicAdapter,
    private readonly fal: FalAdapter,
    private readonly childSafety: ChildSafetyService,
    private readonly useReferenceModelForMulti = false
  ) {}

  async generate(memberId: string, brief: Brief): Promise<Storybook> {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    const note = [brief.note, brief.customStyleNote].filter(Boolean).join(" ");
    if (note) await this.childSafety.checkText(note, `brief-${memberId}`);

    const personas = brief.starringPersonaIds.map((id) => {
      const p = this.store.getPersona(id, memberId);
      if (!p || p.status !== "ready") throw new Error(`Persona ${id} not ready`);
      return p;
    });

    const storybook: Storybook = {
      id: uuid(),
      familyId: member.familyId,
      createdByMemberId: memberId,
      status: "generating",
      brief,
      styleBible: null,
      rerollBudgetRemaining: FREE_REROLL_BUDGET,
      rerollCredits: 0,
      createdAt: new Date(),
      finalizedAt: null,
    };
    this.store.saveStorybook(storybook);

    const generated = await this.anthropic.generateStory({
      brief: `${brief.theme} ${brief.setting ?? ""} ${note}`,
      personaNames: personas.map((p) => p.displayName),
      pageCount: PAGE_COUNT,
    });

    storybook.styleBible = generated.styleBible;
    const scenes = generated.scenes.map((s) => ({
      ...s,
      personaIds: brief.starringPersonaIds,
    }));

    for (const pageData of generated.pages) {
      const scene = scenes.find((s) => s.pageIndex === pageData.index)!;
      const personaCount = scene.personaIds.length;
      let illustrationUrl: string | null = null;
      let generationStatus: "ready" | "quarantined" | "failed" = "ready";

      try {
        let imageUrl: string;
        if (personaCount > 1 && this.useReferenceModelForMulti) {
          const result = await this.fal.generateWithReferenceModel(
            `${generated.styleBible.artStyle}: ${scene.description}`,
            scene.personaIds.map((id) => `https://example.com/ref/${id}.png`)
          );
          imageUrl = result.imageUrl;
        } else if (personaCount > 1) {
          const base = await this.fal.generateImage(scene.description, "base");
          const inpaint = await this.fal.inpaintFaces(
            base.imageUrl,
            scene.personaIds.map((id, i) => ({
              region: `face-${i}`,
              loraKey: this.store.personas.get(id)?.loraWeightKey ?? "lora/default",
            }))
          );
          imageUrl = inpaint.imageUrl;
        } else {
          const loraKey = personas[0].loraWeightKey ?? "lora/default";
          const prompt = `${generated.styleBible.artStyle} | ${generated.styleBible.palette} | ${scene.description}`;
          const result = await this.fal.generateImage(prompt, loraKey);
          imageUrl = result.imageUrl;
        }

        const mod = await this.childSafety.checkGeneratedImage(imageUrl);
        if (mod === "quarantined") {
          generationStatus = "quarantined";
        } else {
          illustrationUrl = imageUrl;
        }
      } catch {
        generationStatus = "failed";
      }

      this.store.savePage({
        id: uuid(),
        storybookId: storybook.id,
        index: pageData.index,
        text: pageData.text,
        illustrationUrl,
        generationStatus,
        personaCount,
      });
    }

    storybook.status = "draft";
    this.store.saveStorybook(storybook);
    return storybook;
  }

  rerollImage(memberId: string, pageId: string): void {
    const page = this.store.pages.get(pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");

    this.decrementRerollBudget(book);

    const candidate: import("@/domain/types").PageCandidate = {
      id: uuid(),
      pageId,
      kind: "image",
      content: `https://example.com/reroll/${pageId}/${Date.now()}.png`,
      selected: false,
      createdAt: new Date(),
    };
    this.store.savePageCandidate(candidate);
  }

  rerollText(memberId: string, pageId: string, newText: string): void {
    const page = this.store.pages.get(pageId);
    if (!page) throw new Error("Page not found");
    const book = this.store.getStorybook(page.storybookId, memberId);
    if (!book) throw new Error("Storybook not found");

    this.decrementRerollBudget(book);

    const candidate = {
      id: uuid(),
      pageId,
      kind: "text" as const,
      content: newText,
      selected: false,
      createdAt: new Date(),
    };
    this.store.savePageCandidate(candidate);
  }

  selectCandidate(memberId: string, candidateId: string): void {
    const candidate = this.store.pageCandidates.get(candidateId);
    if (!candidate) throw new Error("Candidate not found");
    const page = this.store.pages.get(candidate.pageId);
    if (!page) throw new Error("Page not found");
    this.store.getStorybook(page.storybookId, memberId);

    for (const c of this.store.getCandidatesForPage(candidate.pageId)) {
      c.selected = c.id === candidateId;
      this.store.savePageCandidate(c);
    }

    if (candidate.kind === "image") {
      page.illustrationUrl = candidate.content;
    } else {
      page.text = candidate.content;
    }
    this.store.savePage(page);
  }

  buyRerollCredits(memberId: string, storybookId: string, credits: number): void {
    const book = this.store.getStorybook(storybookId, memberId);
    if (!book) throw new Error("Storybook not found");
    book.rerollCredits += credits;
    this.store.saveStorybook(book);
  }

  finalize(memberId: string, storybookId: string): Storybook {
    const book = this.store.getStorybook(storybookId, memberId);
    if (!book) throw new Error("Storybook not found");
    if (book.status !== "draft") throw new Error("Only drafts can be finalized");
    book.status = "finalized";
    book.finalizedAt = new Date();
    this.store.saveStorybook(book);
    return book;
  }

  private decrementRerollBudget(book: Storybook): void {
    if (book.rerollBudgetRemaining > 0) {
      book.rerollBudgetRemaining--;
    } else if (book.rerollCredits > 0) {
      book.rerollCredits--;
    } else {
      throw new Error("Re-roll budget exhausted; purchase credits");
    }
    this.store.saveStorybook(book);
  }
}
