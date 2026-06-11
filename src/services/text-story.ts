import { v4 as uuid } from "uuid";
import type { AnthropicAdapter } from "@/adapters/types";
import type { DataStore } from "@/db/store";
import type { TextStory, TextStoryBrief } from "@/domain/types";
import { ChildSafetyService } from "@/services/child-safety";

export class TextStoryService {
  constructor(
    private readonly store: DataStore,
    private readonly anthropic: AnthropicAdapter,
    private readonly childSafety: ChildSafetyService
  ) {}

  async generate(memberId: string, brief: TextStoryBrief): Promise<TextStory> {
    const member = this.store.members.get(memberId);
    if (!member) throw new Error("Member not found");

    if (!brief.starringCharacterIds.length) {
      throw new Error("At least one Character required");
    }

    if (brief.note) {
      await this.childSafety.checkText(brief.note, `text-story-brief-${memberId}`);
    }

    const characters = brief.starringCharacterIds.map((id) => {
      const character = this.store.getCharacter(id, memberId);
      if (!character) throw new Error(`Character ${id} not found`);
      return character;
    });

    const { text } = await this.anthropic.generateTextStory({
      theme: brief.theme,
      note: brief.note,
      storyType: brief.storyType,
      characters: characters.map((c) => ({
        displayName: c.displayName,
        questionnaire: c.questionnaire,
      })),
    });

    const story: TextStory = {
      id: uuid(),
      familyId: member.familyId,
      createdByMemberId: memberId,
      brief,
      text,
      createdAt: new Date(),
    };
    this.store.saveTextStory(story);
    return story;
  }
}
