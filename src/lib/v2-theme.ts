import type { PersonaStatus, StorybookStatus } from "@/domain/types";

export const AVATAR_GRADIENTS = [
  "linear-gradient(150deg,#8B6DF0,#6A55C9)",
  "linear-gradient(150deg,#E79A3C,#F6C177)",
  "linear-gradient(150deg,#E78AA0,#F2A6B8)",
  "linear-gradient(150deg,#5FB389,#9FD8B1)",
  "linear-gradient(150deg,#3f9bb0,#7fc8c0)",
] as const;

export const HEADER_GRADIENTS = [
  "linear-gradient(135deg,#8B6DF0,#6A55C9)",
  "linear-gradient(135deg,#E79A3C,#F0A878)",
  "linear-gradient(135deg,#E78AA0,#C77FA6)",
  "linear-gradient(135deg,#5FB389,#7FC8A0)",
  "linear-gradient(135deg,#3f9bb0,#5fb3c0)",
] as const;

const BOOK_PALETTES = [
  {
    sky: "linear-gradient(160deg,#4a7f5a,#e8c46a)",
    hill: "#33442a",
    hill2: "#24311e",
    moon: "#FFF6DD",
  },
  {
    sky: "linear-gradient(160deg,#5b8fb0,#cfe6f0)",
    hill: "#3a6885",
    hill2: "#2a5066",
    moon: "#FFFFFF",
  },
  {
    sky: "linear-gradient(160deg,#2f9bb0,#f6d9a0)",
    hill: "#1e7a8c",
    hill2: "#155c6a",
    moon: "#FFF3D6",
  },
  {
    sky: "linear-gradient(160deg,#7a3f6e,#f2a6b8)",
    hill: "#56294f",
    hill2: "#3d1c39",
    moon: "#FFF0E6",
  },
  {
    sky: "linear-gradient(160deg,#3b2f6e,#6a55c9)",
    hill: "#2a2452",
    hill2: "#1f1a3d",
    moon: "#F6C177",
  },
  {
    sky: "linear-gradient(160deg,#8a5a86,#f6b98c)",
    hill: "#5e3a5a",
    hill2: "#43293f",
    moon: "#FFF1E2",
  },
] as const;

export interface BookCoverPalette {
  sky: string;
  hill: string;
  hill2: string;
  moon: string;
}

export function bookCoverPalette(seed: string): BookCoverPalette {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % BOOK_PALETTES.length;
  }
  return BOOK_PALETTES[hash]!;
}

export function bookStatusLabel(status: StorybookStatus): string {
  if (status === "finalized") return "Finalized";
  if (status === "draft") return "Draft";
  if (status === "generating") return "Generating";
  return "Failed";
}

export function bookStatusClass(status: StorybookStatus): string {
  if (status === "finalized") return "v2-book-badge--finalized";
  if (status === "draft") return "v2-book-badge--draft";
  return "v2-book-badge--generating";
}

export function familyMemberStatus(
  personaStatus: PersonaStatus,
  photoCount: number
): { label: string; dot: string; key: "ready" | "training" | "needs-photos" | "failed" } {
  if (personaStatus === "training") {
    return { label: "◐ Training likeness", dot: "#E79A3C", key: "training" };
  }
  if (photoCount === 0) {
    return { label: "＋ Needs photos", dot: "#C9A9A9", key: "needs-photos" };
  }
  if (personaStatus === "ready") {
    return { label: "✓ Illustrated & voiced", dot: "#5FB389", key: "ready" };
  }
  if (personaStatus === "review") {
    return { label: "👀 Reviewing likeness", dot: "#E79A3C", key: "training" };
  }
  return { label: "Unavailable", dot: "#C9A9A9", key: "failed" };
}

export function characterEmoji(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("cat") || lower.includes("coco")) return "🐱";
  if (lower.includes("dragon") || lower.includes("pip")) return "🐲";
  if (lower.includes("moon")) return "🌙";
  if (lower.includes("bear") || lower.includes("bramble")) return "🐻";
  if (lower.includes("bunny") || lower.includes("rabbit")) return "🐰";
  return "🧸";
}
