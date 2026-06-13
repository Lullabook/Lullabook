import { v4 as uuid } from "uuid";
import type { RequestContext } from "@/lib/context";
import type {
  Baby,
  Character,
  Member,
  Persona,
  Storybook,
  StorybookStatus,
  StoryType,
} from "@/domain/types";

/**
 * Dev-only "Maya's World" demo seed for the Supabase-backed runtime.
 *
 * Unlike the test builder in `src/test/fixtures.ts` (which drives the full
 * async generation pipeline via the FakeWorkflow), the production adapters are
 * durable/async (real fal training, liveness, Inngest) and cannot complete
 * synchronously inside a request. This injector therefore writes **display
 * records directly through the family-scoped DataStore** so the running app
 * looks populated (World counts, Family roster, Characters, Stories shelf).
 *
 * Honest limitations: Personas are marked `ready` with a placeholder LoRA key
 * and Storybooks have no generated Pages — these are demo display rows, not
 * real trained models or illustrated books. Every row gets `family_id` from the
 * authenticated Member, so RLS isolation is preserved.
 */

interface AdultSpec {
  displayName: string;
  relationship: string;
  babyCallsThem: string;
  theyCallBaby: string;
  status: "ready" | "training" | "needs-photos";
  voiceClips: { label: string; transcript: string; durationSecs: number }[];
}

const ADULTS: AdultSpec[] = [
  { displayName: "Priya", relationship: "Mom", babyCallsThem: "Mama", theyCallBaby: "my little star", status: "ready", voiceClips: [{ label: "Goodnight, my star", transcript: "Goodnight, my little star.", durationSecs: 4 }, { label: "To the moon", transcript: "I love you to the moon and back.", durationSecs: 5 }] },
  { displayName: "Sam", relationship: "Dad", babyCallsThem: "Dada", theyCallBaby: "peanut", status: "ready", voiceClips: [{ label: "Sweet dreams, peanut", transcript: "Sweet dreams, peanut.", durationSecs: 3 }] },
  { displayName: "Grandma Rose", relationship: "Grandmother", babyCallsThem: "Nani", theyCallBaby: "moonbeam", status: "ready", voiceClips: [{ label: "Twinkle twinkle", transcript: "Twinkle, twinkle, little moonbeam.", durationSecs: 6 }, { label: "Once upon a time", transcript: "Once upon a time, in Nani's garden…", durationSecs: 5 }] },
  { displayName: "Ava", relationship: "Big sister", babyCallsThem: "Sissy", theyCallBaby: "baby sis", status: "training", voiceClips: [{ label: "Night night, baby sis", transcript: "Night night, baby sis!", durationSecs: 3 }] },
  { displayName: "Uncle Leo", relationship: "Uncle", babyCallsThem: "Uncle Lee", theyCallBaby: "little buddy", status: "needs-photos", voiceClips: [] },
];

const CHARACTERS: { name: string; topics: string[]; description: string }[] = [
  { name: "Coco the Cat", topics: ["Curious", "Cuddly"], description: "A curious, cuddly cat who follows Maya everywhere and naps in the sunniest spot." },
  { name: "Pip the Dragon", topics: ["Brave", "Silly"], description: "A tiny, brave dragon who can't breathe fire yet — only glittery, giggly sparkles." },
  { name: "Mr. Moon", topics: ["Wise", "Gentle"], description: "A wise, sleepy moon who saves the softest cloud as a pillow for Maya each night." },
  { name: "Bramble Bear", topics: ["Kind", "Strong"], description: "A gentle forest bear who guards the berry patch and shares every last one." },
];

interface BookSpec {
  theme: string;
  storyType: StoryType;
  personas: string[];
  characters?: string[];
  status: StorybookStatus;
}

const BOOKS: BookSpec[] = [
  { theme: "A Morning in Nani's Garden", storyType: "everyday", personas: ["Grandma Rose"], status: "finalized" },
  { theme: "Maya's Very First Snow", storyType: "milestone", personas: ["Sam"], status: "finalized" },
  { theme: "Maya's Big Beach Day", storyType: "adventure", personas: ["Priya", "Sam", "Grandma Rose", "Ava"], status: "draft" },
  { theme: "The Day Dada Was a Dragon", storyType: "silly", personas: ["Sam"], characters: ["Pip the Dragon"], status: "finalized" },
  { theme: "Counting Stars with Nani", storyType: "learning", personas: ["Grandma Rose"], status: "generating" },
  { theme: "Maya & the Brave Bunnies", storyType: "lesson", personas: ["Ava"], status: "finalized" },
];

export interface SeedDemoResult {
  alreadySeeded: boolean;
  personas: number;
  characters: number;
  books: number;
}

export async function seedMayaWorldRuntime(
  ctx: RequestContext,
  member: Member
): Promise<SeedDemoResult> {
  const familyId = member.familyId;

  // Idempotency: bail if this family already has any storybooks.
  const baby = ctx.babies.ensureDefaultBaby(member.id, "Maya");
  if (ctx.store.listStorybooksForBaby(baby.id, member.id).length > 0) {
    return { alreadySeeded: true, personas: 0, characters: 0, books: 0 };
  }

  if (!ctx.subscriptions.isActive(familyId)) {
    ctx.subscriptions.handleCheckoutCompleted(familyId, `cus_demo_${member.id}`, `sub_demo_${member.id}`);
  }
  ctx.subscriptions.recordConsent(familyId, member.id, member.jurisdiction);

  const now = new Date();

  const babyPersona: Persona = {
    id: uuid(),
    familyId,
    createdByMemberId: member.id,
    kind: "baby",
    displayName: "Maya",
    status: "ready",
    loraWeightKey: `demo-lora/${uuid()}`,
    createdAt: now,
  };
  ctx.store.savePersona(babyPersona);

  const personaByName = new Map<string, Persona>();
  for (const spec of ADULTS) {
    const persona: Persona = {
      id: uuid(),
      familyId,
      createdByMemberId: member.id,
      kind: "adult",
      displayName: spec.displayName,
      status: spec.status === "training" ? "training" : spec.status === "needs-photos" ? "failed" : "ready",
      loraWeightKey: spec.status === "ready" ? `demo-lora/${uuid()}` : null,
      createdAt: now,
    };
    ctx.store.savePersona(persona);
    personaByName.set(spec.displayName, persona);

    ctx.familyRoster.updateBond({
      memberId: member.id,
      babyId: baby.id,
      personaId: persona.id,
      relationship: spec.relationship,
      babyCallsThem: spec.babyCallsThem,
      theyCallBaby: spec.theyCallBaby,
    });

    for (const clip of spec.voiceClips) {
      ctx.store.saveVoiceClip({
        id: uuid(),
        familyId,
        personaId: persona.id,
        label: clip.label,
        transcript: clip.transcript,
        durationSecs: clip.durationSecs,
        blobKey: `demo-voice/${persona.id}/${uuid()}.webm`,
        createdAt: now,
      });
    }
  }

  const characterByName = new Map<string, Character>();
  for (const spec of CHARACTERS) {
    const character: Character = {
      id: uuid(),
      familyId,
      createdByMemberId: member.id,
      displayName: spec.name,
      description: spec.description,
      questionnaire: { name: spec.name, topics: spec.topics, isFictional: true },
      createdAt: now,
    };
    ctx.store.saveCharacter(character);
    characterByName.set(spec.name, character);
  }

  let createdBooks = 0;
  for (const spec of BOOKS) {
    const personaIds = [babyPersona.id, ...spec.personas.map((n) => personaByName.get(n)!.id)];
    const characterIds = (spec.characters ?? []).map((n) => characterByName.get(n)!.id);
    const book: Storybook = {
      id: uuid(),
      familyId,
      babyId: baby.id,
      createdByMemberId: member.id,
      status: spec.status,
      brief: {
        starringPersonaIds: personaIds,
        starringCharacterIds: characterIds.length ? characterIds : undefined,
        babyId: baby.id,
        storyType: spec.storyType,
        theme: spec.theme,
        pageCount: 12,
      },
      styleBible: null,
      rerollBudgetRemaining: 5,
      rerollCredits: 0,
      createdAt: now,
      finalizedAt: spec.status === "finalized" ? now : null,
    };
    ctx.store.saveStorybook(book);
    createdBooks++;
  }

  await ctx.persist();

  return {
    alreadySeeded: false,
    personas: ADULTS.length + 1,
    characters: CHARACTERS.length,
    books: createdBooks,
  };
}
