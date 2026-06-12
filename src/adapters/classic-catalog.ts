import type { ClassicCatalog, ClassicSourceTale } from "@/adapters/types";

/**
 * A curated catalog entry: a public-domain source tale plus the editorial/
 * legal review state that gates whether it is offered (ADR-0017).
 */
export interface CuratedClassicEntry extends ClassicSourceTale {
  author: string;
  firstPublished: number;
  /** True only after counsel has confirmed public-domain status per market. */
  legalConfirmed: boolean;
}

/**
 * The curated public-domain catalog (ADR-0017). No arbitrary "famous
 * stories" — only these reviewed entries, and `getById` only serves entries
 * whose public-domain status is confirmed, so an unreviewed tale can ship in
 * code without being generatable.
 */
export const CURATED_CLASSICS: CuratedClassicEntry[] = [
  {
    id: "alice-in-wonderland",
    title: "Alice's Adventures in Wonderland",
    author: "Lewis Carroll",
    firstPublished: 1865,
    legalConfirmed: true,
    plotBeats: [
      "A curious child follows a hurried White Rabbit and tumbles down a rabbit hole",
      "Shrinking and growing through little doors into a strange wonderland garden",
      "A tea party with funny friends where everything is delightfully backwards",
      "Meeting the grinning Cheshire Cat who points the way with a riddle",
      "A silly croquet game in the queen's garden",
      "Waking safe and cozy — it was a wonderful dream to drift off to",
    ],
  },
  {
    id: "peter-rabbit",
    title: "The Tale of Peter Rabbit",
    author: "Beatrix Potter",
    firstPublished: 1902,
    legalConfirmed: true,
    plotBeats: [
      "A little rabbit is told to stay out of the neighbor's garden",
      "Curiosity wins: squeezing under the gate to nibble the vegetables",
      "A chase through the garden, losing little shoes and jacket along the way",
      "Hiding in a watering can, then finding the way back to the gate",
      "Home at last to a warm burrow, chamomile tea, and bed",
    ],
  },
  {
    id: "goldilocks",
    title: "Goldilocks and the Three Bears",
    author: "Traditional (Robert Southey)",
    firstPublished: 1837,
    legalConfirmed: true,
    plotBeats: [
      "Three bears leave their porridge to cool and go for a walk",
      "A curious visitor tries each bowl — too hot, too cold, just right",
      "Each chair is tried — too hard, too soft, just right (oops, it breaks!)",
      "Each bed is tried, and the visitor falls fast asleep in the littlest one",
      "The bears come home, discover the surprise, and everyone learns to knock first",
    ],
  },
  {
    id: "three-little-pigs",
    title: "The Three Little Pigs",
    author: "Traditional (James Halliwell-Phillipps)",
    firstPublished: 1886,
    legalConfirmed: true,
    plotBeats: [
      "Three little pigs set out to build their own houses",
      "A house of straw and a house of sticks go up quickly",
      "The third pig works hard on a sturdy house of bricks",
      "A huffing, puffing wolf blows down straw and sticks — but not bricks!",
      "Everyone is safe and warm in the brick house, and hard work wins the day",
    ],
  },
  {
    id: "ugly-duckling",
    title: "The Ugly Duckling",
    author: "Hans Christian Andersen",
    firstPublished: 1843,
    // Andersen's tale is public domain, but the editorial normalization of
    // this retelling still needs per-market legal confirmation.
    legalConfirmed: false,
    plotBeats: [
      "A duckling hatches looking different from the rest of the brood",
      "Feeling out of place, the duckling wanders through the seasons",
      "Kind moments and lonely ones, through autumn and a snowy winter",
      "Spring comes, and the duckling sees a beautiful reflection — a swan!",
      "Welcomed by the swans: you were wonderful all along",
    ],
  },
];

/**
 * Real ClassicCatalog: serves only confirmed public-domain entries. Use
 * `listAvailable()` for the parent-facing picker.
 */
export class CuratedClassicCatalog implements ClassicCatalog {
  getById(id: string): ClassicSourceTale | null {
    const entry = CURATED_CLASSICS.find((t) => t.id === id);
    if (!entry || !entry.legalConfirmed) return null;
    return { id: entry.id, title: entry.title, plotBeats: entry.plotBeats };
  }

  listAvailable(): CuratedClassicEntry[] {
    return CURATED_CLASSICS.filter((t) => t.legalConfirmed);
  }
}
