import type { DataStore } from "@/db/store";
import type { Baby, Character, Persona, Storybook } from "@/domain/types";
import type { BabyService } from "@/services/baby";
import type { FamilyRosterService } from "@/services/family-roster";

export interface WorldAvatar {
  personaId: string;
  name: string;
  role: string;
  initial: string;
  badge: string;
  avBg: string;
  kind: "baby" | "adult" | "character";
  personaStatus?: "training" | "ready" | "failed";
  avatarKey?: string | null;
}

export interface WorldHome {
  baby: Baby;
  babyPersona: Persona | null;
  familyCount: number;
  characterCount: number;
  storyCount: number;
  avatars: WorldAvatar[];
  recentBooks: Storybook[];
}

const AVATAR_GRADIENTS = [
  "linear-gradient(150deg,#8B6DF0,#6A55C9)",
  "linear-gradient(150deg,#E79A3C,#F6C177)",
  "linear-gradient(150deg,#E78AA0,#F2A6B8)",
  "linear-gradient(150deg,#5FB389,#9FD8B1)",
  "linear-gradient(150deg,#3f9bb0,#7fc8c0)",
];

export class WorldService {
  constructor(
    private readonly store: DataStore,
    private readonly babies: BabyService,
    private readonly roster: FamilyRosterService
  ) {}

  getHome(memberId: string): WorldHome {
    const baby = this.babies.getSelected(memberId);
    if (!baby) throw new Error("No baby selected");

    const babyPersona = this.findBabyPersona(memberId, baby);
    const roster = this.roster.listForBaby(memberId, baby.id);
    const characters = this.store.getCharactersByFamily(baby.familyId, memberId);
    const books = this.store
      .listStorybooksForBaby(baby.id, memberId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const avatars: WorldAvatar[] = [];

    if (babyPersona) {
      avatars.push({
        personaId: babyPersona.id,
        name: baby.displayName,
        role: "Star",
        initial: baby.displayName.charAt(0).toUpperCase(),
        badge: "⭐",
        avBg: AVATAR_GRADIENTS[0]!,
        kind: "baby",
        personaStatus: babyPersona.status,
        avatarKey: babyPersona.avatarKey,
      });
    }

    roster.forEach((m, i) => {
      avatars.push({
        personaId: m.persona.id,
        name: m.bond?.babyCallsThem ?? m.persona.displayName,
        role: m.bond?.relationship ?? "Family",
        initial: m.persona.displayName.charAt(0).toUpperCase(),
        badge: "💛",
        avBg: AVATAR_GRADIENTS[(i + 1) % AVATAR_GRADIENTS.length]!,
        kind: "adult",
        personaStatus: m.persona.status,
        avatarKey: m.persona.avatarKey,
      });
    });

    characters.slice(0, 4).forEach((c, i) => {
      avatars.push({
        personaId: c.id,
        name: c.displayName,
        role: "Character",
        initial: c.displayName.charAt(0).toUpperCase(),
        badge: "🐻",
        avBg: AVATAR_GRADIENTS[(i + 2) % AVATAR_GRADIENTS.length]!,
        kind: "character",
      });
    });

    return {
      baby,
      babyPersona,
      familyCount: roster.length + (babyPersona ? 1 : 0),
      characterCount: characters.length,
      storyCount: books.length,
      avatars,
      recentBooks: books.slice(0, 3),
    };
  }

  private findBabyPersona(memberId: string, baby: Baby): Persona | null {
    const personas = this.store.getPersonasByFamily(baby.familyId, memberId);
    return (
      personas.find((p) => p.kind === "baby" && p.displayName === baby.displayName) ??
      personas.find((p) => p.kind === "baby") ??
      null
    );
  }
}
