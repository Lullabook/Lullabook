"use client";

/**
 * "Maya's World" — faithful React port of the Claude Design v2 prototype
 * (Lullabook Redesign v2.dc.html). Self-contained visual surface on MOCK data
 * so the new direction is clickable at /world without touching the real backend
 * or domain model. Wiring this to real Families/voice/multi-baby + the free vs
 * paid split is a separate planning+build pass (see CONTEXT handoffs).
 */

import { useState, type CSSProperties } from "react";

// CSS-string -> React style object, so the prototype's inline styles port verbatim.
function s(css: string): CSSProperties {
  const o: Record<string, string> = {};
  for (const decl of css.split(";")) {
    const i = decl.indexOf(":");
    if (i < 0) continue;
    const k = decl.slice(0, i).trim();
    const v = decl.slice(i + 1).trim();
    if (!k) continue;
    o[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return o as CSSProperties;
}

// ----------------------------- mock data -----------------------------------

function makeBars(seed: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < 28; i++) {
    const v = 4 + Math.abs(Math.sin(seed + i * 0.7) * Math.cos(seed * 1.3 + i * 0.3)) * 18;
    arr.push(Math.round(v));
  }
  return arr;
}

const ALL_BOOKS = [
  { id: "garden", title: "A Morning in Nani’s Garden", cast: "Maya & Nani", date: "Jun 10", status: "finalized", sky: "linear-gradient(160deg,#4a7f5a,#e8c46a)", hill: "#33442a", hill2: "#24311e", moon: "#FFF6DD" },
  { id: "snow", title: "Maya’s Very First Snow", cast: "Maya & Dada", date: "Jun 7", status: "finalized", sky: "linear-gradient(160deg,#5b8fb0,#cfe6f0)", hill: "#3a6885", hill2: "#2a5066", moon: "#FFFFFF" },
  { id: "beach", title: "Maya’s Big Beach Day", cast: "The whole family", date: "Jun 5", status: "draft", sky: "linear-gradient(160deg,#2f9bb0,#f6d9a0)", hill: "#1e7a8c", hill2: "#155c6a", moon: "#FFF3D6" },
  { id: "dragon", title: "The Day Dada Was a Dragon", cast: "Maya, Dada & Pip", date: "Jun 2", status: "finalized", sky: "linear-gradient(160deg,#7a3f6e,#f2a6b8)", hill: "#56294f", hill2: "#3d1c39", moon: "#FFF0E6" },
  { id: "stars", title: "Counting Stars with Nani", cast: "Maya & Nani", date: "Now", status: "generating", sky: "linear-gradient(160deg,#3b2f6e,#6a55c9)", hill: "#2a2452", hill2: "#1f1a3d", moon: "#F6C177" },
  { id: "bunnies", title: "Maya & the Brave Bunnies", cast: "Maya & Sissy", date: "May 29", status: "finalized", sky: "linear-gradient(160deg,#8a5a86,#f6b98c)", hill: "#5e3a5a", hill2: "#43293f", moon: "#FFF1E2" },
];

const FAMILY = [
  { id: "mom", name: "Priya", rel: "Mom", babyCalls: "Mama", nickname: "my little star", initial: "P", avBg: "linear-gradient(150deg,#8B6DF0,#6A55C9)", headerBg: "linear-gradient(135deg,#8B6DF0,#6A55C9)", photos: 7, status: "ready",
    audios: [{ label: "Good morning song", dur: "0:24", text: "Rise and shine, my little star ☀️", bars: makeBars(1) }, { label: "I love you", dur: "0:08", text: "Mama loves you more than all the stars.", bars: makeBars(2) }] },
  { id: "dad", name: "Sam", rel: "Dad", babyCalls: "Dada", nickname: "peanut", initial: "S", avBg: "linear-gradient(150deg,#E79A3C,#F6C177)", headerBg: "linear-gradient(135deg,#E79A3C,#F0A878)", photos: 5, status: "ready",
    audios: [{ label: "To the moon", dur: "0:11", text: "I love you to the moon and back, peanut.", bars: makeBars(3) }] },
  { id: "nani", name: "Grandma Rose", rel: "Grandmother", babyCalls: "Nani", nickname: "moonbeam", initial: "R", avBg: "linear-gradient(150deg,#E78AA0,#F2A6B8)", headerBg: "linear-gradient(135deg,#E78AA0,#C77FA6)", photos: 8, status: "ready",
    audios: [{ label: "Bedtime lullaby", dur: "0:42", text: "Hush now my little moonbeam, the day is tucked away…", bars: makeBars(4) }, { label: "Story hello", dur: "0:06", text: "Hello my darling moonbeam!", bars: makeBars(5) }] },
  { id: "ava", name: "Ava", rel: "Big sister", babyCalls: "Sissy", nickname: "baby sis", initial: "A", avBg: "linear-gradient(150deg,#5FB389,#9FD8B1)", headerBg: "linear-gradient(135deg,#5FB389,#7FC8A0)", photos: 4, status: "training",
    audios: [{ label: "Giggle hello", dur: "0:05", text: "Hi baby sis, it’s me!", bars: makeBars(6) }] },
  { id: "leo", name: "Uncle Leo", rel: "Uncle", babyCalls: "Uncle Lee", nickname: "little buddy", initial: "L", avBg: "linear-gradient(150deg,#3f9bb0,#7fc8c0)", headerBg: "linear-gradient(135deg,#3f9bb0,#5fb3c0)", photos: 0, status: "needs-photos", audios: [] as { label: string; dur: string; text: string; bars: number[] }[] },
];

const CHARACTERS = [
  { id: "coco", name: "Coco the Cat", short: "Coco", emoji: "🐱", avBg: "linear-gradient(150deg,#F6C177,#F0A878)", appears: "In 3 stories", trait: "A curious, cuddly cat who follows Maya everywhere and naps in sunbeams.", tags: ["Curious", "Cuddly"] },
  { id: "pip", name: "Pip the Dragon", short: "Pip", emoji: "🐲", avBg: "linear-gradient(150deg,#8B6DF0,#B9A5F5)", appears: "In 2 stories", trait: "A tiny, brave dragon who can’t breathe fire yet — only soap bubbles.", tags: ["Brave", "Silly"] },
  { id: "moon", name: "Mr. Moon", short: "Mr. Moon", emoji: "🌙", avBg: "linear-gradient(150deg,#3b2f6e,#6a55c9)", appears: "In 5 stories", trait: "A wise, sleepy moon who saves the softest cloud just for Maya.", tags: ["Wise", "Gentle"] },
  { id: "bramble", name: "Bramble Bear", short: "Bramble", emoji: "🐻", avBg: "linear-gradient(150deg,#5FB389,#9FD8B1)", appears: "In 1 story", trait: "A gentle forest bear who guards the berry patch and gives the best hugs.", tags: ["Kind", "Strong"] },
];

const READER_PAGES = [
  "The sun peeked over the hills and tickled Maya’s nose awake.",
  "“Good morning, moonbeam!” called Nani from the garden gate.",
  "Maya toddled out in her little boots, with Coco the cat close behind.",
  "Dewdrops sparkled on every leaf like a thousand tiny mirrors.",
  "“Look!” said Maya, pointing at a snail wearing a shiny shell hat.",
  "They planted three small seeds and patted the soft brown earth.",
  "A butterfly landed on Maya’s finger and stayed for a whole song.",
  "Coco chased a bumblebee, then pretended she meant to miss.",
  "Nani poured cool lemonade and they rested beneath the big oak.",
  "Maya watched a cloud shaped just like a sleepy elephant drift by.",
  "“What should we grow tomorrow?” asked Nani. “Everything!” laughed Maya.",
  "And the whole garden seemed happy to be part of Maya’s world.",
];

const STORY_TYPES = [
  { id: "everyday", icon: "🌼", label: "Everyday moment", desc: "A small, real slice of their day" },
  { id: "milestone", icon: "🎉", label: "Big milestone", desc: "First steps, first words, firsts" },
  { id: "adventure", icon: "🚀", label: "Little adventure", desc: "Brave quests and faraway places" },
  { id: "lesson", icon: "🌟", label: "Gentle lesson", desc: "Sharing, kindness, big feelings" },
  { id: "bedtime", icon: "🌙", label: "Bedtime calm", desc: "Soft and sleepy, ends in a yawn" },
  { id: "silly", icon: "😄", label: "Silly & giggly", desc: "Giggles and happy nonsense" },
];

const ART_STYLES = [
  { id: "watercolor", icon: "🎨", label: "Soft watercolor", sky: "linear-gradient(160deg,#4a7f5a,#e8c46a)" },
  { id: "pastel", icon: "☁️", label: "Dreamy pastel", sky: "linear-gradient(160deg,#7a3f6e,#f2a6b8)" },
  { id: "bright", icon: "🌈", label: "Bold & bright", sky: "linear-gradient(160deg,#2f9bb0,#f6d9a0)" },
  { id: "ink", icon: "✒️", label: "Storybook ink", sky: "linear-gradient(160deg,#3b2f6e,#6a55c9)" },
];

// helpers
const badgeStyleFor = (st: string) =>
  st === "finalized" ? "background:rgba(159,216,177,0.95); color:#1d4a30;"
    : st === "draft" ? "background:rgba(246,193,119,0.95); color:#5a3a10;"
    : "background:rgba(185,165,245,0.95); color:#2e1f5e;";
const statusLabelFor = (st: string) => (st === "finalized" ? "Finalized" : st === "draft" ? "Draft" : "Generating");
const familyStatusMeta = (st: string) =>
  st === "ready" ? { label: "✓ Illustrated & voiced", dot: "#5FB389" }
    : st === "training" ? { label: "◐ Training likeness", dot: "#E79A3C" }
    : st === "needs-photos" ? { label: "＋ Needs photos", dot: "#C9A9A9" }
    : { label: "Text only", dot: "#B9A5F5" };

const NAV = [
  { key: "world", icon: "☀️", label: "World" },
  { key: "stories", icon: "📚", label: "Stories" },
  { key: "create", icon: "✨", label: "Create" },
  { key: "family", icon: "💛", label: "Family" },
  { key: "characters", icon: "🐻", label: "Characters" },
];

// ----------------------------- component -----------------------------------

export default function WorldPage() {
  const [screen, setScreen] = useState("world");
  const [filter, setFilter] = useState("All");
  const [readerPage, setReaderPage] = useState(4);
  const [familyId, setFamilyId] = useState("nani");
  const [cast, setCast] = useState<string[]>(["mom", "coco"]);
  const [storyType, setStoryType] = useState("everyday");
  const [artStyle, setArtStyle] = useState("watercolor");
  const [pages, setPages] = useState(12);
  const [themeText, setThemeText] = useState("A sunny morning in Nani’s garden");

  const go = (sc: string) => { setScreen(sc); if (typeof window !== "undefined") window.scrollTo(0, 0); };

  const navBtnStyle = (active: boolean): CSSProperties => ({
    display: "flex", alignItems: "center", gap: "6px", padding: "9px 14px",
    borderRadius: "999px", border: "none", cursor: "pointer",
    fontFamily: "'Nunito', sans-serif", fontWeight: 700, fontSize: "0.9rem",
    background: active ? "#EDE7FE" : "transparent", color: active ? "#6A55C9" : "#6E6076",
  });
  const chipStyle = (active: boolean): CSSProperties => ({
    padding: "7px 15px", borderRadius: "999px",
    border: "1px solid " + (active ? "#8B6DF0" : "#ECE1CE"),
    background: active ? "#EDE7FE" : "#FFFDF9", color: active ? "#6A55C9" : "#6E6076",
    fontWeight: 700, fontSize: "0.85rem", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
  });

  const statusMap: Record<string, string> = { Finalized: "finalized", Drafts: "draft", Generating: "generating" };
  const books = ALL_BOOKS.filter((b) => filter === "All" || b.status === statusMap[filter]);
  const recentBooks = ALL_BOOKS.slice(0, 3);

  const dm = FAMILY.find((m) => m.id === familyId) || FAMILY[0];
  const dmeta = familyStatusMeta(dm.status);

  const toggleCast = (id: string) =>
    setCast((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const castSource = [
    ...FAMILY.map((m) => ({ id: m.id, name: m.name, avBg: m.avBg, initial: m.initial, kind: m.rel })),
    ...CHARACTERS.map((c) => ({ id: c.id, name: c.short, avBg: c.avBg, initial: c.emoji, kind: "Made-up" })),
  ];
  const selectedNames = castSource.filter((p) => cast.includes(p.id)).map((p) => p.name);
  const castSummary = selectedNames.length ? ["Maya", ...selectedNames].join(", ") : "Maya";
  const artObj = ART_STYLES.find((a) => a.id === artStyle)!;
  const storyTypeLabel = STORY_TYPES.find((t) => t.id === storyType)?.label || "—";

  const Book = ({ b }: { b: (typeof ALL_BOOKS)[number] }) => (
    <div style={s("display:flex; flex-direction:column; gap:11px;")}>
      <button onClick={() => go("reader")} className="lb-book" style={s(`position:relative; border:none; padding:0; cursor:pointer; width:100%; aspect-ratio:4/5; border-radius:18px; overflow:hidden; box-shadow:0 12px 28px rgba(58,40,80,0.16); background:${b.sky}; transition:transform 180ms ease, box-shadow 180ms ease;`)}>
        <span style={s(`position:absolute; top:16px; right:18px; width:34px; height:34px; border-radius:50%; background:${b.moon}; box-shadow:0 0 20px rgba(255,240,200,0.45);`)} />
        <span style={s(`position:absolute; bottom:-26px; left:-18px; width:140px; height:90px; border-radius:50%; background:${b.hill};`)} />
        <span style={s(`position:absolute; bottom:-34px; right:-22px; width:120px; height:78px; border-radius:50%; background:${b.hill2};`)} />
        <span style={s("position:absolute; left:0; right:0; bottom:0; height:62%; background:linear-gradient(to top, rgba(20,14,40,0.78), transparent);")} />
        <span style={s(`position:absolute; top:13px; left:14px; padding:4px 10px; border-radius:999px; font-size:0.68rem; font-weight:800; text-transform:uppercase; letter-spacing:0.05em; ${badgeStyleFor(b.status)}`)}>{statusLabelFor(b.status)}</span>
        <span style={s("position:absolute; bottom:54px; right:12px; font-family:'Nunito',monospace; font-size:0.6rem; letter-spacing:0.08em; color:rgba(255,255,255,0.45);")}>illustration</span>
        <span style={s("position:absolute; left:16px; right:16px; bottom:16px; text-align:left; color:#FAF4E6; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.02rem; line-height:1.15;")}>{b.title}</span>
      </button>
      <div style={s("display:flex; align-items:center; justify-content:space-between; padding:0 4px;")}>
        <span style={s("color:#6E6076; font-size:0.82rem; font-weight:700;")}>{b.cast}</span>
        <span style={s("color:#A99FB0; font-size:0.8rem;")}>{b.date}</span>
      </div>
    </div>
  );

  return (
    <div style={s("min-height:100dvh; background:#FBF4E7; color:#2E2438; font-family:'Nunito',sans-serif; line-height:1.6; padding-bottom:72px; position:relative; overflow:hidden;")}>
      {/* fonts + global keyframes/hover (React 19 hoists link/style to head) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400;1,600&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes lbTwinkle { 0%,100%{opacity:.25;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }
        @keyframes lbFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .lb-lift{transition:transform 160ms ease, box-shadow 160ms ease;}
        .lb-lift:hover{transform:translateY(-2px);}
        .lb-book:hover{transform:translateY(-6px) rotate(-1deg); box-shadow:0 22px 44px rgba(58,40,80,0.26);}
      `}</style>

      <div style={s("position:absolute; top:-160px; right:-120px; width:520px; height:520px; border-radius:50%; background:radial-gradient(circle, rgba(139,109,240,0.14), transparent 65%); pointer-events:none;")} />
      <div style={s("position:absolute; top:240px; left:-160px; width:480px; height:480px; border-radius:50%; background:radial-gradient(circle, rgba(231,154,60,0.13), transparent 65%); pointer-events:none;")} />

      {/* header */}
      <header style={s("position:sticky; top:0; z-index:40; backdrop-filter:saturate(1.3) blur(10px); background:rgba(251,244,231,0.82); border-bottom:1px solid #F0E6D2;")}>
        <div style={s("max-width:1200px; margin:0 auto; display:flex; align-items:center; justify-content:space-between; gap:16px; padding:13px 22px;")}>
          <button onClick={() => go("world")} style={s("display:flex; align-items:center; gap:9px; background:none; border:none; cursor:pointer; padding:0;")}>
            <span style={s("width:38px; height:38px; border-radius:13px; background:linear-gradient(150deg,#8B6DF0,#6A55C9); display:flex; align-items:center; justify-content:center; font-size:1.15rem; box-shadow:0 6px 16px rgba(106,85,201,0.35);")}>☀️</span>
            <span style={s("font-family:'Baloo 2',cursive; font-weight:800; font-size:1.5rem; color:#2E2438; letter-spacing:-0.01em;")}>Lullabook</span>
          </button>
          <nav style={s("display:flex; gap:3px; background:#FFFDF9; border:1px solid #ECE1CE; border-radius:999px; padding:5px; box-shadow:0 4px 14px rgba(58,40,80,0.05);")}>
            {NAV.map((n) => (
              <button key={n.key} onClick={() => go(n.key)} style={navBtnStyle(screen === n.key)}>
                <span style={s("font-size:1rem;")}>{n.icon}</span>
                <span>{n.label}</span>
              </button>
            ))}
          </nav>
          <div style={s("display:flex; align-items:center; gap:12px;")}>
            <span style={s("display:inline-flex; align-items:center; gap:6px; padding:6px 13px; border-radius:999px; background:#FBEBCE; color:#9A6B1E; font-weight:800; font-size:0.78rem;")}>✨ Illustrated</span>
            <span style={s("width:40px; height:40px; border-radius:50%; background:linear-gradient(150deg,#E78AA0,#8B6DF0); color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.05rem;")}>M</span>
          </div>
        </div>
      </header>

      <main style={s("max-width:1200px; margin:0 auto; padding:30px 22px; position:relative; z-index:1;")}>

        {/* ===================== WORLD ===================== */}
        {screen === "world" && (
          <div style={s("display:flex; flex-direction:column; gap:26px;")}>
            <div style={s("position:relative; border-radius:30px; overflow:hidden; background:linear-gradient(135deg,#6A55C9 0%,#B5739E 48%,#F0A878 100%); box-shadow:0 24px 56px rgba(106,85,201,0.32); padding:42px 32px; text-align:center;")}>
              <div style={s("position:absolute; top:34px; left:60px; width:6px; height:6px; border-radius:50%; background:#fff; animation:lbTwinkle 2.6s ease-in-out infinite;")} />
              <div style={s("position:absolute; top:70px; right:90px; width:5px; height:5px; border-radius:50%; background:#FFF3D6; animation:lbTwinkle 3s ease-in-out infinite .5s;")} />
              <div style={s("position:absolute; bottom:40px; left:120px; width:5px; height:5px; border-radius:50%; background:#fff; animation:lbTwinkle 2.8s ease-in-out infinite 1s;")} />
              <p style={s("text-transform:uppercase; letter-spacing:0.18em; font-size:0.74rem; font-weight:800; color:#FFE9C9; margin:0 0 16px;")}>✨ A growing world starring</p>
              <div style={s("width:120px; height:120px; border-radius:50%; margin:0 auto 18px; background:linear-gradient(150deg,#FFFDF9,#FBE7C8); display:flex; align-items:center; justify-content:center; font-family:'Baloo 2',cursive; font-weight:800; font-size:3.2rem; color:#6A55C9; box-shadow:0 14px 34px rgba(0,0,0,0.22); border:5px solid rgba(255,255,255,0.5); animation:lbFloat 6s ease-in-out infinite;")}>M</div>
              <h1 style={s("font-family:'Baloo 2',cursive; font-weight:800; font-size:2.8rem; margin:0; color:#fff; letter-spacing:-0.02em;")}>Maya’s World</h1>
              <p style={s("margin:10px auto 0; max-width:520px; color:#FBEAF3; font-size:1.1rem;")}>A whole world of stories starring Maya — and everyone who loves her. Built page by page, voice by voice.</p>
              <div style={s("display:flex; gap:18px; justify-content:center; margin-top:22px; flex-wrap:wrap;")}>
                <span style={s("display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:999px; background:rgba(255,255,255,0.18); color:#fff; font-weight:800; font-size:0.9rem;")}>💛 5 family</span>
                <span style={s("display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:999px; background:rgba(255,255,255,0.18); color:#fff; font-weight:800; font-size:0.9rem;")}>🐻 4 characters</span>
                <span style={s("display:inline-flex; align-items:center; gap:7px; padding:8px 16px; border-radius:999px; background:rgba(255,255,255,0.18); color:#fff; font-weight:800; font-size:0.9rem;")}>📚 6 stories</span>
              </div>
              <button onClick={() => go("create")} className="lb-lift" style={s("margin-top:24px; display:inline-flex; align-items:center; gap:9px; padding:15px 28px; border-radius:999px; border:none; background:#FFFDF9; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:1.05rem; cursor:pointer; box-shadow:0 12px 28px rgba(0,0,0,0.18);")}>✨ Start a new story</button>
            </div>

            <div>
              <div style={s("display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px;")}>
                <h2 style={s("font-family:'Baloo 2',cursive; font-weight:700; font-size:1.5rem; margin:0; color:#2E2438;")}>Everyone in Maya’s world</h2>
                <button onClick={() => go("family")} style={s("background:none; border:none; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:0.92rem; cursor:pointer;")}>Manage family →</button>
              </div>
              <div style={s("display:flex; gap:18px; flex-wrap:wrap;")}>
                {[
                  { initial: "M", name: "Maya", role: "The star", avBg: "linear-gradient(150deg,#F6C177,#E79A3C)", badge: "⭐" },
                  ...FAMILY.map((m) => ({ initial: m.initial, name: m.name, role: m.rel, avBg: m.avBg, badge: "💛" })),
                  ...CHARACTERS.map((c) => ({ initial: c.emoji, name: c.short, role: "Made-up", avBg: c.avBg, badge: "🐻" })),
                ].map((a, i) => (
                  <div key={i} style={s("display:flex; flex-direction:column; align-items:center; gap:8px; width:84px;")}>
                    <div style={s(`position:relative; width:68px; height:68px; border-radius:50%; background:${a.avBg}; display:flex; align-items:center; justify-content:center; color:#fff; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.5rem; box-shadow:0 8px 18px rgba(58,40,80,0.14); border:3px solid #FFFDF9;`)}>{a.initial}
                      <span style={s("position:absolute; bottom:-2px; right:-2px; width:22px; height:22px; border-radius:50%; background:#FFFDF9; display:flex; align-items:center; justify-content:center; font-size:0.7rem;")}>{a.badge}</span>
                    </div>
                    <span style={s("font-size:0.8rem; font-weight:800; color:#2E2438; text-align:center; line-height:1.1;")}>{a.name}</span>
                    <span style={s("font-size:0.68rem; color:#9A8A78; text-align:center; line-height:1;")}>{a.role}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={s("display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:14px;")}>
                <h2 style={s("font-family:'Baloo 2',cursive; font-weight:700; font-size:1.5rem; margin:0; color:#2E2438;")}>Lately in Maya’s world</h2>
                <button onClick={() => go("stories")} style={s("background:none; border:none; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:0.92rem; cursor:pointer;")}>All stories →</button>
              </div>
              <div style={s("display:grid; gap:22px; grid-template-columns:repeat(auto-fill, minmax(196px,1fr));")}>
                {recentBooks.map((b) => <Book key={b.id} b={b} />)}
              </div>
            </div>
          </div>
        )}

        {/* ===================== STORIES ===================== */}
        {screen === "stories" && (
          <div style={s("display:flex; flex-direction:column; gap:26px;")}>
            <div style={s("display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap;")}>
              <div>
                <p style={s("text-transform:uppercase; letter-spacing:0.16em; font-size:0.74rem; font-weight:800; color:#8B6DF0; margin:0 0 6px;")}>📚 Maya’s shelf</p>
                <h1 style={s("font-family:'Baloo 2',cursive; font-weight:800; font-size:2.5rem; margin:0; color:#2E2438; letter-spacing:-0.02em;")}>Stories</h1>
                <p style={s("margin:6px 0 0; color:#6E6076; font-size:1.05rem;")}>6 storybooks in Maya’s world · 4 of her cast ready to star</p>
              </div>
              <div style={s("display:flex; gap:10px;")}>
                <button className="lb-lift" style={s("display:inline-flex; align-items:center; gap:8px; padding:12px 18px; border-radius:999px; border:1px solid #ECE1CE; background:#FFFDF9; color:#2E2438; font-family:'Nunito'; font-weight:800; font-size:0.95rem; cursor:pointer;")}>📖 Classics</button>
                <button onClick={() => go("create")} className="lb-lift" style={s("display:inline-flex; align-items:center; gap:8px; padding:12px 20px; border-radius:999px; border:none; background:linear-gradient(135deg,#F6C177,#E79A3C); color:#3a2410; font-family:'Nunito'; font-weight:800; font-size:0.95rem; cursor:pointer; box-shadow:0 8px 20px rgba(231,154,60,0.32);")}>✨ New Story</button>
              </div>
            </div>

            <div style={s("position:relative; border-radius:28px; overflow:hidden; background:linear-gradient(135deg,#6A55C9 0%,#B5739E 52%,#F0A878 100%); box-shadow:0 22px 50px rgba(106,85,201,0.3);")}>
              <div style={s("display:flex; gap:28px; align-items:center; padding:26px; flex-wrap:wrap;")}>
                <div style={s("position:relative; width:150px; height:188px; border-radius:16px; overflow:hidden; flex-shrink:0; background:linear-gradient(160deg,#9BC4E2,#F6D9A0); box-shadow:0 12px 30px rgba(0,0,0,0.28); animation:lbFloat 6s ease-in-out infinite;")}>
                  <div style={s("position:absolute; top:18px; right:18px; width:38px; height:38px; border-radius:50%; background:#F6C177; box-shadow:0 0 22px rgba(246,193,119,0.7);")} />
                  <div style={s("position:absolute; bottom:-22px; left:-14px; width:120px; height:80px; border-radius:50%; background:#5FB389;")} />
                  <div style={s("position:absolute; bottom:-28px; right:-20px; width:110px; height:70px; border-radius:50%; background:#3E7A5A;")} />
                  <span style={s("position:absolute; bottom:12px; left:14px; right:14px; color:#fff; font-family:'Baloo 2',cursive; font-weight:700; font-size:0.92rem; line-height:1.15;")}>Maya’s Big Garden Morning</span>
                </div>
                <div style={s("flex:1; min-width:240px; color:#fff;")}>
                  <p style={s("text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; font-weight:800; color:#FFE9C9; margin:0 0 8px;")}>📖 Continue reading</p>
                  <h2 style={s("font-family:'Baloo 2',cursive; font-weight:700; font-size:1.85rem; margin:0 0 6px; color:#fff;")}>Maya’s Big Garden Morning</h2>
                  <p style={s("margin:0 0 16px; color:#FBEAF3;")}>A sunny everyday adventure starring Maya & Nani · Page 4 of 12</p>
                  <div style={s("height:9px; border-radius:999px; background:rgba(255,255,255,0.22); overflow:hidden; max-width:380px;")}>
                    <div style={s("width:33%; height:100%; border-radius:999px; background:linear-gradient(90deg,#FFFDF9,#F6C177);")} />
                  </div>
                  <div style={s("display:flex; gap:12px; margin-top:20px; flex-wrap:wrap;")}>
                    <button onClick={() => go("reader")} className="lb-lift" style={s("display:inline-flex; align-items:center; gap:8px; padding:12px 22px; border-radius:999px; border:none; background:#FFFDF9; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:0.95rem; cursor:pointer;")}>▶ Resume reading</button>
                    <button style={s("display:inline-flex; align-items:center; gap:8px; padding:12px 20px; border-radius:999px; border:1px solid rgba(255,255,255,0.4); background:rgba(255,255,255,0.1); color:#fff; font-family:'Nunito'; font-weight:700; font-size:0.95rem; cursor:pointer;")}>🔗 Share</button>
                  </div>
                </div>
              </div>
            </div>

            <div style={s("display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-top:4px;")}>
              <h2 style={s("font-family:'Baloo 2',cursive; font-weight:700; font-size:1.5rem; margin:0; color:#2E2438;")}>Every story so far</h2>
              <div style={s("display:flex; gap:8px; flex-wrap:wrap;")}>
                {["All", "Finalized", "Drafts", "Generating"].map((f) => (
                  <button key={f} onClick={() => setFilter(f)} style={chipStyle(filter === f)}>{f}</button>
                ))}
              </div>
            </div>

            <div style={s("display:grid; gap:22px; grid-template-columns:repeat(auto-fill, minmax(196px,1fr));")}>
              {books.map((b) => <Book key={b.id} b={b} />)}
              <button onClick={() => go("create")} className="lb-lift" style={s("aspect-ratio:4/5; border-radius:18px; border:2px dashed #D8C9B0; background:#FFF8EC; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; color:#9A8A78; font-family:'Nunito'; font-weight:800; font-size:0.95rem;")}>
                <span style={s("width:48px; height:48px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:1.5rem; box-shadow:0 6px 16px rgba(58,40,80,0.1);")}>＋</span>
                New Story
              </button>
            </div>
          </div>
        )}

        {/* ===================== FAMILY ===================== */}
        {screen === "family" && (
          <div style={s("display:flex; flex-direction:column; gap:22px;")}>
            <div style={s("display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap;")}>
              <div>
                <p style={s("text-transform:uppercase; letter-spacing:0.16em; font-size:0.74rem; font-weight:800; color:#8B6DF0; margin:0 0 6px;")}>💛 Maya’s family</p>
                <h1 style={s("font-family:'Baloo 2',cursive; font-weight:800; font-size:2.3rem; margin:0; color:#2E2438; letter-spacing:-0.02em;")}>The people in her world</h1>
                <p style={s("margin:6px 0 0; color:#6E6076; font-size:1.02rem; max-width:560px;")}>Real people who love Maya. Add their photos and their voice, and they’ll look and sound like themselves in every story.</p>
              </div>
              <button className="lb-lift" style={s("display:inline-flex; align-items:center; gap:8px; padding:12px 20px; border-radius:999px; border:none; background:linear-gradient(135deg,#8B6DF0,#6A55C9); color:#fff; font-family:'Nunito'; font-weight:800; font-size:0.95rem; cursor:pointer; box-shadow:0 8px 20px rgba(106,85,201,0.3);")}>＋ Add family member</button>
            </div>

            <div style={s("display:grid; gap:22px; grid-template-columns:320px 1fr; align-items:start;")}>
              <div style={s("display:flex; flex-direction:column; gap:12px;")}>
                {FAMILY.map((m) => {
                  const meta = familyStatusMeta(m.status); const sel = familyId === m.id;
                  return (
                    <button key={m.id} onClick={() => setFamilyId(m.id)} style={{
                      display: "flex", alignItems: "center", gap: "13px", padding: "13px 14px", borderRadius: "18px", cursor: "pointer",
                      textAlign: "left", fontFamily: "'Nunito', sans-serif",
                      border: "1.5px solid " + (sel ? "#8B6DF0" : "#ECE1CE"),
                      background: sel ? "#F6F1FF" : "#FFFDF9",
                      boxShadow: sel ? "0 6px 18px rgba(139,109,240,0.14)" : "0 4px 12px rgba(58,40,80,0.04)",
                    }}>
                      <span style={s(`width:50px; height:50px; border-radius:50%; background:${m.avBg}; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:#fff; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.3rem;`)}>{m.initial}</span>
                      <span style={s("display:flex; flex-direction:column; align-items:flex-start; flex:1; line-height:1.2; min-width:0;")}>
                        <span style={s("font-family:'Baloo 2',cursive; font-weight:700; font-size:1.1rem; color:#2E2438;")}>{m.name}</span>
                        <span style={s("font-size:0.82rem; color:#9A8A78; font-weight:700;")}>{m.rel} · calls her “{m.babyCalls}”</span>
                      </span>
                      <span style={s(`width:9px; height:9px; border-radius:50%; background:${meta.dot}; flex-shrink:0;`)} />
                    </button>
                  );
                })}
                <button style={s("display:flex; align-items:center; gap:12px; padding:14px; border-radius:18px; border:2px dashed #D8C9B0; background:#FFF8EC; cursor:pointer; color:#9A8A78; font-family:'Nunito'; font-weight:800; font-size:0.95rem;")}>
                  <span style={s("width:50px; height:50px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:1.4rem; box-shadow:0 4px 12px rgba(58,40,80,0.1);")}>＋</span>
                  Add someone who loves Maya
                </button>
              </div>

              <div style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:26px; box-shadow:0 12px 32px rgba(58,40,80,0.08); overflow:hidden;")}>
                <div style={s(`position:relative; padding:26px; background:${dm.headerBg}; display:flex; align-items:center; gap:18px;`)}>
                  <span style={s(`width:78px; height:78px; border-radius:50%; background:${dm.avBg}; display:flex; align-items:center; justify-content:center; color:#fff; font-family:'Baloo 2',cursive; font-weight:700; font-size:2rem; box-shadow:0 8px 20px rgba(0,0,0,0.18); border:4px solid rgba(255,255,255,0.55);`)}>{dm.initial}</span>
                  <div style={s("flex:1;")}>
                    <h2 style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:800; font-size:1.7rem; color:#fff;")}>{dm.name}</h2>
                    <div style={s("display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;")}>
                      <span style={s("padding:5px 12px; border-radius:999px; background:rgba(255,255,255,0.25); color:#fff; font-weight:800; font-size:0.8rem;")}>{dm.rel} to Maya</span>
                      <span style={s("padding:5px 12px; border-radius:999px; background:rgba(255,255,255,0.95); color:#3a2410; font-weight:800; font-size:0.8rem;")}>{dmeta.label}</span>
                    </div>
                  </div>
                </div>

                <div style={s("padding:24px; display:flex; flex-direction:column; gap:24px;")}>
                  <div style={s("display:grid; gap:16px; grid-template-columns:1fr 1fr;")}>
                    <div style={s("background:#FBF4E7; border:1px solid #F0E6D2; border-radius:16px; padding:16px;")}>
                      <p style={s("margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.12em; font-weight:800; color:#9A8A78;")}>What Maya calls them</p>
                      <p style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.4rem; color:#6A55C9;")}>“{dm.babyCalls}”</p>
                    </div>
                    <div style={s("background:#FBF4E7; border:1px solid #F0E6D2; border-radius:16px; padding:16px;")}>
                      <p style={s("margin:0 0 8px; font-size:0.72rem; text-transform:uppercase; letter-spacing:0.12em; font-weight:800; color:#9A8A78;")}>What they call Maya</p>
                      <p style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.4rem; color:#E79A3C;")}>“{dm.nickname}”</p>
                    </div>
                  </div>

                  <div>
                    <div style={s("display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;")}>
                      <h3 style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.2rem; color:#2E2438;")}>📸 How they look</h3>
                      <span style={s("font-size:0.85rem; color:#9A8A78; font-weight:700;")}>{dm.photos > 0 ? dm.photos + " photos" : "No photos yet"}</span>
                    </div>
                    <div style={s("display:grid; gap:10px; grid-template-columns:repeat(auto-fill, minmax(92px,1fr));")}>
                      {Array.from({ length: 6 }, (_, i) => {
                        const filled = i < Math.min(dm.photos, 6);
                        const isAdd = i === Math.min(dm.photos, 6);
                        return (
                          <div key={i} style={filled
                            ? s(`aspect-ratio:1; border-radius:12px; background:repeating-linear-gradient(45deg, rgba(255,255,255,0.20) 0 7px, transparent 7px 14px), ${dm.avBg}; box-shadow:inset 0 0 0 1px rgba(255,255,255,0.35);`)
                            : { aspectRatio: "1", borderRadius: "12px", border: "2px dashed #D8C9B0", background: "#FBF4E7", display: "flex", alignItems: "center", justifyContent: "center", color: "#B7A992", fontFamily: "'Nunito', monospace", fontSize: isAdd ? "1.4rem" : "0.7rem" }}>
                            {filled ? "" : isAdd ? "＋" : "photo"}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* voice — hero feature */}
                  <div style={s("background:linear-gradient(160deg,#2A2452,#3E2F63); border-radius:20px; padding:22px; color:#FAF4E6;")}>
                    <div style={s("display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px; flex-wrap:wrap;")}>
                      <h3 style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.25rem; color:#fff;")}>🎙️ Their real voice</h3>
                      <span style={s("padding:4px 11px; border-radius:999px; background:#FBEBCE; color:#9A6B1E; font-weight:800; font-size:0.72rem;")}>✨ Illustrated plan</span>
                    </div>
                    <p style={s("margin:0 0 16px; color:#C9BDE8; font-size:0.92rem;")}>Record a few lines and Maya will hear {dm.name} read to her — in their own voice, on every page.</p>
                    <div style={s("display:flex; flex-direction:column; gap:12px;")}>
                      {dm.audios.map((clip, ci) => (
                        <div key={ci} style={s("display:flex; align-items:center; gap:14px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:12px 14px;")}>
                          <span style={s("width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg,#F6C177,#E79A3C); color:#3a2410; display:flex; align-items:center; justify-content:center; font-size:1rem; flex-shrink:0; cursor:pointer;")}>▶</span>
                          <div style={s("flex:1; min-width:0;")}>
                            <div style={s("display:flex; align-items:center; gap:10px; margin-bottom:6px;")}>
                              <span style={s("font-weight:800; font-size:0.92rem; color:#fff;")}>{clip.label}</span>
                              <span style={s("font-size:0.78rem; color:#9F92C4;")}>{clip.dur}</span>
                            </div>
                            <div style={s("display:flex; align-items:flex-end; gap:2px; height:22px;")}>
                              {clip.bars.map((bar, bi) => (
                                <span key={bi} style={s(`width:3px; border-radius:2px; background:rgba(185,165,245,0.75); height:${bar}px;`)} />
                              ))}
                            </div>
                            <p style={s("margin:8px 0 0; font-style:italic; color:#D7CBEE; font-size:0.86rem;")}>“{clip.text}”</p>
                          </div>
                        </div>
                      ))}
                      {dm.audios.length === 0 && (
                        <div style={s("padding:14px; border-radius:14px; border:1px dashed rgba(255,255,255,0.3); color:#C9BDE8; font-size:0.9rem; text-align:center;")}>No voice messages yet — record one so Maya can hear them.</div>
                      )}
                      <button className="lb-lift" style={s("display:inline-flex; align-self:flex-start; align-items:center; gap:8px; padding:11px 18px; border-radius:999px; border:none; background:#FAF4E6; color:#2A2452; font-family:'Nunito'; font-weight:800; font-size:0.9rem; cursor:pointer;")}>🔴 Record a new message</button>
                    </div>
                  </div>

                  <div style={s("display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:4px; flex-wrap:wrap;")}>
                    <span style={s("color:#6E6076; font-size:0.9rem;")}>{dm.status === "ready" ? `Ready to star — looks and sounds like ${dm.name}.` : dm.status === "training" ? "Training likeness — about 4 minutes left." : `Add a few photos to bring ${dm.name} to life.`}</span>
                    <button className="lb-lift" style={s("padding:11px 20px; border-radius:999px; border:none; background:linear-gradient(135deg,#8B6DF0,#6A55C9); color:#fff; font-family:'Nunito'; font-weight:800; font-size:0.92rem; cursor:pointer;")}>✨ Cast in a story</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== CHARACTERS ===================== */}
        {screen === "characters" && (
          <div style={s("display:flex; flex-direction:column; gap:22px;")}>
            <div style={s("display:flex; align-items:flex-end; justify-content:space-between; gap:20px; flex-wrap:wrap;")}>
              <div>
                <p style={s("text-transform:uppercase; letter-spacing:0.16em; font-size:0.74rem; font-weight:800; color:#8B6DF0; margin:0 0 6px;")}>🐻 Made-up friends</p>
                <h1 style={s("font-family:'Baloo 2',cursive; font-weight:800; font-size:2.3rem; margin:0; color:#2E2438; letter-spacing:-0.02em;")}>Characters</h1>
                <p style={s("margin:6px 0 0; color:#6E6076; font-size:1.02rem; max-width:560px;")}>Imaginary friends you invent for Maya’s world — a brave little dragon, a sleepy moon, a cat who talks. Free to create from a few traits.</p>
              </div>
              <button className="lb-lift" style={s("display:inline-flex; align-items:center; gap:8px; padding:12px 20px; border-radius:999px; border:1px solid #ECE1CE; background:#FFFDF9; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:0.95rem; cursor:pointer;")}>＋ Invent a character</button>
            </div>
            <div style={s("display:grid; gap:18px; grid-template-columns:repeat(auto-fill, minmax(250px,1fr));")}>
              {CHARACTERS.map((c) => (
                <div key={c.id} style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px; padding:20px; box-shadow:0 8px 22px rgba(58,40,80,0.07); display:flex; flex-direction:column; gap:14px;")}>
                  <div style={s("display:flex; align-items:center; gap:14px;")}>
                    <div style={s(`width:62px; height:62px; border-radius:20px; background:${c.avBg}; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1.7rem;`)}>{c.emoji}</div>
                    <div>
                      <h3 style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.2rem; color:#2E2438;")}>{c.name}</h3>
                      <span style={s("color:#9A8A78; font-size:0.82rem; font-weight:700;")}>{c.appears}</span>
                    </div>
                  </div>
                  <p style={s("margin:0; color:#6E6076; font-size:0.9rem; line-height:1.4; min-height:38px;")}>{c.trait}</p>
                  <div style={s("display:flex; gap:6px; flex-wrap:wrap;")}>
                    {c.tags.map((t) => <span key={t} style={s("padding:4px 11px; border-radius:999px; background:#EDE7FE; color:#6A55C9; font-size:0.76rem; font-weight:700;")}>{t}</span>)}
                  </div>
                  <div style={s("height:1px; background:#F0E6D2;")} />
                  <button style={s("width:100%; padding:10px; border-radius:12px; border:1px solid #ECE1CE; background:#FFF8EC; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:0.88rem; cursor:pointer;")}>Edit character →</button>
                </div>
              ))}
              <button className="lb-lift" style={s("border:2px dashed #D8C9B0; border-radius:22px; background:#FFF8EC; cursor:pointer; min-height:230px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#9A8A78; font-family:'Nunito'; font-weight:800; font-size:0.98rem; text-align:center;")}>
                <span style={s("width:54px; height:54px; border-radius:50%; background:#fff; display:flex; align-items:center; justify-content:center; font-size:1.6rem; box-shadow:0 6px 16px rgba(58,40,80,0.1);")}>＋</span>
                Invent a new<br />made-up friend
              </button>
            </div>
          </div>
        )}

        {/* ===================== CREATE ===================== */}
        {screen === "create" && (
          <div style={s("display:flex; flex-direction:column; gap:8px;")}>
            <p style={s("text-transform:uppercase; letter-spacing:0.16em; font-size:0.74rem; font-weight:800; color:#8B6DF0; margin:0;")}>✨ New story</p>
            <h1 style={s("font-family:'Baloo 2',cursive; font-weight:800; font-size:2.3rem; margin:0 0 4px; color:#2E2438; letter-spacing:-0.02em;")}>Add a story to Maya’s world</h1>
            <p style={s("margin:0 0 24px; color:#6E6076; font-size:1.05rem; max-width:580px;")}>Any kind of moment — a big adventure, a quiet morning, a milestone. We’ll write and illustrate ~12 pages, and you curate every one.</p>

            <div style={s("display:grid; gap:26px; grid-template-columns:1.55fr 1fr; align-items:start;")}>
              <div style={s("display:flex; flex-direction:column; gap:22px;")}>
                <div style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px; padding:22px; box-shadow:0 8px 24px rgba(58,40,80,0.06);")}>
                  <label style={s("display:block; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.15rem; color:#2E2438; margin-bottom:4px;")}>What’s the story about?</label>
                  <p style={s("margin:0 0 12px; color:#9A8A78; font-size:0.9rem;")}>A theme, a feeling, or a little moment from your day.</p>
                  <input value={themeText} onChange={(e) => setThemeText(e.target.value)} style={s("width:100%; font-family:'Nunito'; font-size:1.05rem; color:#2E2438; background:#FBF4E7; border:1px solid #ECE1CE; border-radius:14px; padding:14px 16px; box-sizing:border-box;")} />
                  <div style={s("display:flex; gap:8px; flex-wrap:wrap; margin-top:12px;")}>
                    <span style={s("font-size:0.82rem; color:#9A8A78; font-weight:700; align-self:center;")}>Try:</span>
                    <span style={s("padding:6px 12px; border-radius:999px; background:#EDE7FE; color:#6A55C9; font-size:0.82rem; font-weight:700;")}>a morning in the garden</span>
                    <span style={s("padding:6px 12px; border-radius:999px; background:#FBEBCE; color:#9A6B1E; font-size:0.82rem; font-weight:700;")}>first steps</span>
                    <span style={s("padding:6px 12px; border-radius:999px; background:#E1F1E8; color:#3E7A5A; font-size:0.82rem; font-weight:700;")}>learning to share</span>
                  </div>
                </div>

                <div style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px; padding:22px; box-shadow:0 8px 24px rgba(58,40,80,0.06);")}>
                  <label style={s("display:block; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.15rem; color:#2E2438; margin-bottom:4px;")}>Who’s starring?</label>
                  <p style={s("margin:0 0 14px; color:#9A8A78; font-size:0.9rem;")}>Maya always stars. Add family and made-up friends to the cast.</p>
                  <div style={s("display:flex; gap:10px; flex-wrap:wrap;")}>
                    {castSource.map((c) => {
                      const sel = cast.includes(c.id);
                      return (
                        <button key={c.id} onClick={() => toggleCast(c.id)} style={{
                          display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px 9px 9px", borderRadius: "999px", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                          border: "1.5px solid " + (sel ? "#8B6DF0" : "#ECE1CE"), background: sel ? "#EDE7FE" : "#FFFDF9", color: sel ? "#4A3D6B" : "#2E2438",
                          boxShadow: sel ? "0 0 0 3px rgba(139,109,240,0.12)" : "none",
                        }}>
                          <span style={s(`width:34px; height:34px; border-radius:50%; background:${c.avBg}; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Baloo 2',cursive; font-weight:700; font-size:0.95rem; flex-shrink:0;`)}>{c.initial}</span>
                          <span style={s("display:flex; flex-direction:column; align-items:flex-start; line-height:1.1;")}>
                            <span style={s("font-weight:800; font-size:0.92rem;")}>{c.name}</span>
                            <span style={s("font-size:0.72rem; opacity:0.7;")}>{c.kind}</span>
                          </span>
                          <span style={s("font-size:0.95rem;")}>{sel ? "✓" : "+"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px; padding:22px; box-shadow:0 8px 24px rgba(58,40,80,0.06);")}>
                  <label style={s("display:block; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.15rem; color:#2E2438; margin-bottom:14px;")}>What kind of story?</label>
                  <div style={s("display:grid; gap:12px; grid-template-columns:repeat(auto-fit, minmax(150px,1fr));")}>
                    {STORY_TYPES.map((t) => {
                      const active = storyType === t.id;
                      return (
                        <button key={t.id} onClick={() => setStoryType(t.id)} style={{
                          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px", textAlign: "left", padding: "16px", borderRadius: "16px", cursor: "pointer", fontFamily: "'Nunito', sans-serif",
                          border: "1.5px solid " + (active ? "#8B6DF0" : "#ECE1CE"), background: active ? "#EDE7FE" : "#FBF4E7", color: active ? "#4A3D6B" : "#2E2438",
                          boxShadow: active ? "0 6px 18px rgba(139,109,240,0.16)" : "none",
                        }}>
                          <span style={s("font-size:1.5rem;")}>{t.icon}</span>
                          <span style={s("font-family:'Baloo 2',cursive; font-weight:700; font-size:1rem;")}>{t.label}</span>
                          <span style={s("font-size:0.82rem; opacity:0.78; line-height:1.3;")}>{t.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={s("display:grid; gap:22px; grid-template-columns:1fr 1fr;")}>
                  <div style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px; padding:22px; box-shadow:0 8px 24px rgba(58,40,80,0.06);")}>
                    <label style={s("display:block; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.1rem; color:#2E2438; margin-bottom:12px;")}>Art style</label>
                    <div style={s("display:flex; gap:8px; flex-wrap:wrap;")}>
                      {ART_STYLES.map((a) => <button key={a.id} onClick={() => setArtStyle(a.id)} style={chipStyle(artStyle === a.id)}>{a.icon} {a.label}</button>)}
                    </div>
                  </div>
                  <div style={s("background:#FFFDF9; border:1px solid #ECE1CE; border-radius:22px; padding:22px; box-shadow:0 8px 24px rgba(58,40,80,0.06);")}>
                    <label style={s("display:block; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.1rem; color:#2E2438; margin-bottom:12px;")}>How long?</label>
                    <div style={s("display:flex; gap:8px;")}>
                      {[8, 12, 16].map((p) => <button key={p} onClick={() => setPages(p)} style={{ ...chipStyle(pages === p), flex: 1, padding: "12px 8px", textAlign: "center", justifyContent: "center" }}>{p} pages</button>)}
                    </div>
                  </div>
                </div>
              </div>

              <div style={s("position:sticky; top:90px; display:flex; flex-direction:column; gap:16px; background:linear-gradient(160deg,#6A55C9,#B5739E); border-radius:24px; padding:24px; box-shadow:0 18px 44px rgba(106,85,201,0.28);")}>
                <p style={s("text-transform:uppercase; letter-spacing:0.16em; font-size:0.72rem; font-weight:800; color:#FFE9C9; margin:0;")}>Your brief</p>
                <div style={s(`position:relative; width:100%; aspect-ratio:4/5; border-radius:16px; overflow:hidden; background:${artObj.sky};`)}>
                  <span style={s("position:absolute; top:16px; right:18px; width:34px; height:34px; border-radius:50%; background:#F6C177; box-shadow:0 0 20px rgba(246,193,119,0.5);")} />
                  <span style={s("position:absolute; bottom:-26px; left:-18px; width:140px; height:90px; border-radius:50%; background:rgba(20,14,40,0.4);")} />
                  <span style={s("position:absolute; left:0; right:0; bottom:0; height:60%; background:linear-gradient(to top, rgba(20,14,40,0.78), transparent);")} />
                  <span style={s("position:absolute; left:16px; right:16px; bottom:16px; color:#FAF4E6; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.1rem; line-height:1.2;")}>{themeText}</span>
                </div>
                <div style={s("display:flex; flex-direction:column; gap:10px; color:#fff;")}>
                  {[["Starring", castSummary], ["Type", storyTypeLabel], ["Art", artObj.label], ["Length", `${pages} pages`]].map(([k, v], i) => (
                    <div key={i}>
                      <div style={s("display:flex; justify-content:space-between; gap:12px; font-size:0.92rem;")}><span style={s("color:#FBEAF3;")}>{k}</span><span style={s("font-weight:800; text-align:right;")}>{v}</span></div>
                      {i < 3 && <div style={s("height:1px; background:rgba(255,255,255,0.18); margin-top:10px;")} />}
                    </div>
                  ))}
                </div>
                <button onClick={() => go("reader")} className="lb-lift" style={s("margin-top:4px; width:100%; padding:15px; border-radius:14px; border:none; background:#FFFDF9; color:#6A55C9; font-family:'Nunito'; font-weight:800; font-size:1.02rem; cursor:pointer; box-shadow:0 8px 20px rgba(0,0,0,0.16);")}>✨ Generate story</button>
                <p style={s("margin:0; text-align:center; color:#FBEAF3; font-size:0.8rem;")}>About 4 minutes to your first pages</p>
              </div>
            </div>
          </div>
        )}

        {/* ===================== READER ===================== */}
        {screen === "reader" && (
          <div style={s("display:flex; flex-direction:column; gap:18px;")}>
            <div style={s("display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;")}>
              <button onClick={() => go("stories")} style={s("display:inline-flex; align-items:center; gap:8px; padding:10px 16px; border-radius:999px; border:1px solid #ECE1CE; background:#FFFDF9; color:#2E2438; font-family:'Nunito'; font-weight:800; font-size:0.9rem; cursor:pointer;")}>‹ Back to stories</button>
              <div style={s("text-align:center;")}>
                <h2 style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:700; font-size:1.3rem; color:#2E2438;")}>Maya’s Big Garden Morning</h2>
                <span style={s("color:#9A8A78; font-size:0.85rem; font-weight:700;")}>Page {readerPage} of 12 · Draft</span>
              </div>
              <div style={s("display:flex; gap:8px;")}>
                <button style={s("padding:10px 16px; border-radius:999px; border:1px solid #ECE1CE; background:#FFFDF9; color:#2E2438; font-family:'Nunito'; font-weight:800; font-size:0.9rem; cursor:pointer;")}>🔗 Share</button>
                <button style={s("padding:10px 16px; border-radius:999px; border:none; background:linear-gradient(135deg,#F6C177,#E79A3C); color:#3a2410; font-family:'Nunito'; font-weight:800; font-size:0.9rem; cursor:pointer;")}>⬇ Export PDF</button>
              </div>
            </div>

            <div style={s("position:relative; border-radius:28px; overflow:hidden; background:#FFFDF9; border:1px solid #ECE1CE; box-shadow:0 24px 56px rgba(58,40,80,0.14);")}>
              <div style={s("display:grid; grid-template-columns:1fr 1fr; gap:0; align-items:stretch; min-height:440px;")}>
                <div style={s("position:relative; overflow:hidden; background:linear-gradient(160deg,#9BC4E2,#F6D9A0); min-height:360px;")}>
                  <div style={s("position:absolute; top:40px; right:54px; width:78px; height:78px; border-radius:50%; background:#F6C177; box-shadow:0 0 50px rgba(246,193,119,0.7);")} />
                  <div style={s("position:absolute; bottom:-54px; left:-44px; width:280px; height:190px; border-radius:50%; background:#5FB389;")} />
                  <div style={s("position:absolute; bottom:-74px; right:-54px; width:250px; height:170px; border-radius:50%; background:#3E7A5A;")} />
                  <div style={s("position:absolute; bottom:50px; left:60px; width:18px; height:18px; border-radius:50%; background:#E78AA0;")} />
                  <div style={s("position:absolute; bottom:80px; left:120px; width:14px; height:14px; border-radius:50%; background:#F6C177;")} />
                  <span style={s("position:absolute; bottom:16px; left:18px; font-family:'Nunito',monospace; font-size:0.7rem; letter-spacing:0.1em; color:rgba(255,255,255,0.7);")}>illustration · page {readerPage}</span>
                </div>
                <div style={s("display:flex; flex-direction:column; justify-content:center; gap:24px; padding:48px 44px;")}>
                  <span style={s("font-family:'Nunito'; font-weight:800; font-size:0.74rem; letter-spacing:0.18em; text-transform:uppercase; color:#E79A3C;")}>Page {readerPage}</span>
                  <p style={s("margin:0; font-family:'Baloo 2',cursive; font-weight:500; font-size:1.55rem; line-height:1.55; color:#2E2438;")}>{READER_PAGES[readerPage - 1]}</p>
                  <div style={s("display:flex; align-items:center; gap:11px; background:#FBF4E7; border:1px solid #F0E6D2; border-radius:14px; padding:10px 14px; align-self:flex-start;")}>
                    <span style={s("width:38px; height:38px; border-radius:50%; background:linear-gradient(135deg,#8B6DF0,#6A55C9); color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer;")}>▶</span>
                    <span style={s("font-size:0.86rem; font-weight:700; color:#6A55C9;")}>Hear Nani read this page</span>
                  </div>
                  <div style={s("display:flex; gap:10px; flex-wrap:wrap;")}>
                    <button style={s("display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:999px; border:1px solid #ECE1CE; background:#FFFDF9; color:#2E2438; font-family:'Nunito'; font-weight:700; font-size:0.85rem; cursor:pointer;")}>✍️ Re-roll text</button>
                    <button style={s("display:inline-flex; align-items:center; gap:7px; padding:9px 15px; border-radius:999px; border:1px solid #ECE1CE; background:#FFFDF9; color:#2E2438; font-family:'Nunito'; font-weight:700; font-size:0.85rem; cursor:pointer;")}>🎨 Re-roll art</button>
                  </div>
                </div>
              </div>
            </div>

            <div style={s("display:flex; align-items:center; justify-content:center; gap:20px;")}>
              <button onClick={() => setReaderPage((p) => Math.max(1, p - 1))} style={s("width:52px; height:52px; border-radius:50%; border:1px solid #ECE1CE; background:#FFFDF9; color:#2E2438; font-size:1.4rem; cursor:pointer; box-shadow:0 6px 16px rgba(58,40,80,0.08);")}>‹</button>
              <div style={s("display:flex; gap:7px; align-items:center;")}>
                {Array.from({ length: 12 }, (_, i) => {
                  const n = i + 1; const cur = n === readerPage; const read = n < readerPage;
                  return <span key={n} onClick={() => setReaderPage(n)} style={{ width: cur ? "30px" : "9px", height: "9px", borderRadius: "999px", cursor: "pointer", transition: "all 200ms ease", background: cur ? "#8B6DF0" : read ? "#F6C177" : "#E2D6BE" }} />;
                })}
              </div>
              <button onClick={() => setReaderPage((p) => Math.min(12, p + 1))} className="lb-lift" style={s("width:52px; height:52px; border-radius:50%; border:none; background:linear-gradient(135deg,#8B6DF0,#6A55C9); color:#fff; font-size:1.4rem; cursor:pointer; box-shadow:0 8px 20px rgba(106,85,201,0.32);")}>›</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
