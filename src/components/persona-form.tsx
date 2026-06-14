"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/actions";
import { createPersonaAction, promoteCharacterAction } from "@/lib/actions";

interface PersonaFormProps {
  /** When set, this form promotes an existing Character instead. */
  characterId?: string;
  characterName?: string;
  isGuardian: boolean;
  canCreateBaby: boolean;
  babyBlockedReason?: string;
}

const label: CSSProperties = {
  display: "block",
  fontFamily: "var(--v2-font-display)",
  fontWeight: 700,
  fontSize: "1.05rem",
  color: "#2E2438",
  marginBottom: 6,
};
const input: CSSProperties = {
  width: "100%",
  fontSize: "1rem",
  color: "#2E2438",
  background: "#FBF4E7",
  border: "1px solid #ECE1CE",
  borderRadius: 14,
  padding: "13px 15px",
  boxSizing: "border-box",
};
const cardStyle: CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 22,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

export function PersonaForm({
  characterId,
  characterName,
  isGuardian,
  canCreateBaby,
  babyBlockedReason,
}: PersonaFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"adult" | "baby">("adult");
  const [consented, setConsented] = useState(false);

  // form fields used by the live preview
  const [name, setName] = useState(characterName ?? "");
  const [relationship, setRelationship] = useState("");
  const [babyCalls, setBabyCalls] = useState("");
  const [theyCallBaby, setTheyCallBaby] = useState("");

  // Native <input type="file" multiple> REPLACES its FileList every time the
  // picker reopens, so we keep our own accumulating list and mirror it back
  // into the real input via DataTransfer so the server action still receives
  // them under formData.getAll("photos").
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!photoInputRef.current) return;
    const dt = new DataTransfer();
    for (const file of photos) dt.items.add(file);
    photoInputRef.current.files = dt.files;
    setPreviews(photos.map((f) => URL.createObjectURL(f)));
  }, [photos]);

  function addPhotos(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    setPhotos((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
      const merged = [...prev];
      for (const file of Array.from(picked)) {
        if (!file.type.startsWith("image")) continue;
        const key = `${file.name}:${file.size}:${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(file);
        }
      }
      return merged;
    });
  }
  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }
  function pickSelfie(picked: FileList | null) {
    const f = picked?.[0];
    if (!f) return;
    setSelfie(f);
    setSelfiePreview(URL.createObjectURL(f));
  }

  const enough = photos.length >= 3;
  const showSelfie = mode === "adult" || Boolean(characterId);
  const ready = enough && consented && (!showSelfie || Boolean(selfie));

  function submit(formData: FormData) {
    setError(null);
    if (!consented) return setError("Please confirm the consent statement first.");
    if (photos.length < 3) return setError(`Please add at least 3 photos (you have ${photos.length}).`);
    formData.set("mode", mode);
    formData.set("displayName", name);
    // Extra family fields — persist these in createPersonaAction if/when wired.
    formData.set("relationship", relationship);
    formData.set("babyCalls", babyCalls);
    formData.set("theyCallBaby", theyCallBaby);
    if (characterId) formData.set("characterId", characterId);
    startTransition(async () => {
      const res: ActionResult = characterId
        ? await promoteCharacterAction(formData)
        : await createPersonaAction(formData);
      if (!res.ok) return setError(res.error);
      router.push("/personas?training=1");
    });
  }

  const previewInitial = (name.trim()[0] || "?").toUpperCase();

  return (
    <div style={{ display: "grid", gap: 26, gridTemplateColumns: "minmax(0,1.5fr) minmax(0,1fr)", alignItems: "start" }}>
      <form action={submit} style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {error && (
          <div className="v2-form alert alert-error" role="alert" style={{ borderRadius: 16, padding: "14px 16px", background: "#fdf1f3", border: "1px solid #eccdd2", color: "#b23a48" }}>
            {error}
          </div>
        )}

        {!characterId && (
          <div style={cardStyle}>
            <span style={label}>Who is this?</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }} role="radiogroup" aria-label="Persona kind">
              <KindChip active={mode === "adult"} onClick={() => setMode("adult")} icon="🧑" text="An adult" />
              <KindChip active={mode === "baby"} onClick={() => setMode("baby")} icon="👶" text="My baby" />
            </div>
            {mode === "baby" && !isGuardian && (
              <p style={{ marginTop: 8, fontSize: "0.85rem", color: "#9A8A78" }}>Only the family&apos;s Guardian can create a baby persona.</p>
            )}
            {mode === "baby" && isGuardian && !canCreateBaby && (
              <div style={{ marginTop: 12, borderRadius: 16, padding: "12px 14px", background: "#FBEBCE", border: "1px solid #f0d9ad", color: "#9a6b1e", fontSize: "0.9rem" }}>
                {babyBlockedReason ?? "Baby personas need an active subscription — the card payment doubles as verifiable parental consent."}
              </div>
            )}
          </div>
        )}

        {/* name + relationship */}
        <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 18 }}>
          {characterId ? (
            <div style={{ borderRadius: 16, padding: "12px 14px", background: "#FFF8EC", border: "1px solid #ECE1CE", color: "#6E6076", fontSize: "0.92rem" }}>
              Upgrading <strong>{characterName}</strong> to an illustrated persona. Their traits carry forward; now we just need photos.
            </div>
          ) : (
            <div>
              <label htmlFor="displayName" style={label}>Their name</label>
              <input id="displayName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nadia" required style={input} />
            </div>
          )}
          <div>
            <label htmlFor="relationship" style={label}>Their relationship to the baby</label>
            <input id="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} placeholder="Grandma" style={input} />
          </div>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
            <div>
              <label htmlFor="babyCalls" style={label}>What the baby calls them</label>
              <input id="babyCalls" value={babyCalls} onChange={(e) => setBabyCalls(e.target.value)} placeholder="Nani" style={{ ...input, color: "#6A55C9", fontFamily: "var(--v2-font-display)", fontWeight: 700 }} />
            </div>
            <div>
              <label htmlFor="theyCallBaby" style={label}>What they call the baby</label>
              <input id="theyCallBaby" value={theyCallBaby} onChange={(e) => setTheyCallBaby(e.target.value)} placeholder="moonbeam" style={{ ...input, color: "#E79A3C", fontFamily: "var(--v2-font-display)", fontWeight: 700 }} />
            </div>
          </div>
        </div>

        {/* photos */}
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ ...label, marginBottom: 0, fontSize: "1.15rem" }}>📸 Their photos</span>
            <span style={{ padding: "5px 12px", borderRadius: 999, fontWeight: 800, fontSize: "0.78rem", background: enough ? "#E1F1E8" : "#FBEBCE", color: enough ? "#3E7A5A" : "#9A6B1E" }}>
              {photos.length === 0 ? "No photos yet" : enough ? `✓ ${photos.length} photos — ready` : `${photos.length} of 3 added`}
            </span>
          </div>
          <p style={{ margin: "0 0 14px", color: "#9A8A78", fontSize: "0.88rem" }}>
            At least 3 clear, well-lit photos of just this person. Add a few at once or keep adding — they accumulate.
          </p>

          <label
            htmlFor="photos"
            onDrop={(e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => e.preventDefault()}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, textAlign: "center", padding: "30px 20px", borderRadius: 18, border: "2px dashed #D8C9B0", background: "#FFF8EC", cursor: "pointer" }}
          >
            <span style={{ width: 54, height: 54, borderRadius: "50%", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem", boxShadow: "0 6px 16px rgba(58,40,80,0.1)" }} aria-hidden="true">⬆️</span>
            <span style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.05rem", color: "#6A55C9" }}>Drag photos here, or tap to browse</span>
            <span style={{ fontSize: "0.82rem", color: "#9A8A78" }}>JPG or PNG · up to 10 photos</span>
            <input ref={photoInputRef} id="photos" name="photos" type="file" accept="image/*" multiple onChange={(e) => addPhotos(e.target.files)} style={{ display: "none" }} />
          </label>

          {photos.length > 0 && (
            <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0, display: "grid", gap: 10 }}>
              {photos.map((file, i) => (
                <li key={`${file.name}:${file.size}:${file.lastModified}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 12, border: "1px solid #ECE1CE", background: "#FFF8EC" }}>
                  <span style={{ fontSize: "0.88rem", color: "#6E6076", fontFamily: "var(--v2-font-body)" }}>Photo {i + 1}: {file.name}</span>
                  <button type="button" aria-label={`Remove ${file.name}`} onClick={() => removePhoto(i)} style={{ width: 24, height: 24, borderRadius: "50%", border: "none", background: "rgba(46,36,56,0.72)", color: "#fff", cursor: "pointer", fontSize: "0.9rem", lineHeight: 1 }}>×</button>
                </li>
              ))}
            </ul>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
            <span style={{ padding: "6px 12px", borderRadius: 999, background: "#E1F1E8", color: "#3E7A5A", fontSize: "0.8rem", fontWeight: 700 }}>✓ One person per photo</span>
            <span style={{ padding: "6px 12px", borderRadius: 999, background: "#EDE7FE", color: "#6A55C9", fontSize: "0.8rem", fontWeight: 700 }}>☀️ Bright &amp; in focus</span>
            <span style={{ padding: "6px 12px", borderRadius: 999, background: "#FBEBCE", color: "#9A6B1E", fontSize: "0.8rem", fontWeight: 700 }}>🙂 A few angles</span>
          </div>
        </div>

        {/* selfie */}
        {showSelfie && (
          <div style={cardStyle}>
            <span style={{ ...label, fontSize: "1.15rem" }}>🤳 A selfie, taken now</span>
            <p style={{ margin: "0 0 14px", color: "#9A8A78", fontSize: "0.88rem" }}>
              For an adult&apos;s own likeness we ask for one fresh selfie that matches the photos above — it&apos;s how we confirm consent.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div
                style={
                  selfie
                    ? { width: 64, height: 64, borderRadius: 16, background: "#E1F1E8", border: "2px solid #5FB389", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }
                    : { width: 64, height: 64, borderRadius: 16, background: "#FBF4E7", border: "2px dashed #D8C9B0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.5rem", color: "#B7A992" }
                }
                aria-hidden="true"
              >
                {selfie ? "✓" : "🤳"}
              </div>
              <label htmlFor="selfie" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 999, border: "1px solid #ECE1CE", background: "#FFF8EC", color: "#6A55C9", fontWeight: 800, fontSize: "0.92rem", cursor: "pointer" }}>
                {selfie ? "↻ Retake selfie" : "🤳 Take a selfie"}
              </label>
              <input id="selfie" name="selfie" type="file" accept="image/*" capture="user" onChange={(e) => pickSelfie(e.target.files)} style={{ display: "none" }} />
            </div>
          </div>
        )}

        {/* consent + submit */}
        <div style={cardStyle}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
            <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} style={{ marginTop: 4, width: 18, height: 18, accentColor: "#6A55C9" }} />
            <span style={{ fontSize: "0.92rem", color: "#6E6076" }}>
              {mode === "baby" && !characterId
                ? "I am this child's Guardian. I consent to training a private likeness model from these photos. My active subscription's card payment verifies this consent."
                : "These photos are of me. I consent to training a private likeness model of myself."}
            </span>
          </label>
          <button
            type="submit"
            disabled={pending || !ready || (mode === "baby" && (!isGuardian || !canCreateBaby))}
            style={{ marginTop: 16, width: "100%", padding: 15, borderRadius: 14, border: "none", background: ready ? "linear-gradient(135deg,#8B6DF0,#6A55C9)" : "#E7DCCB", color: ready ? "#fff" : "#9A8A78", fontWeight: 800, fontSize: "1.02rem", cursor: ready && !pending ? "pointer" : "not-allowed", boxShadow: ready ? "0 8px 20px rgba(106,85,201,0.3)" : "none" }}
          >
            {pending ? "Uploading…" : ready ? "✨ Start training (~5 minutes)" : photos.length < 3 ? `Add ${3 - photos.length} more photo${3 - photos.length === 1 ? "" : "s"}` : "Confirm consent to continue"}
          </button>
        </div>
      </form>

      {/* live member preview */}
      <aside style={{ position: "sticky", top: 92, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: "#FFFDF9", border: "1px solid #ECE1CE", borderRadius: 24, overflow: "hidden", boxShadow: "0 12px 32px rgba(58,40,80,0.08)" }}>
          <div style={{ padding: 22, background: "linear-gradient(135deg,#8B6DF0,#6A55C9)", display: "flex", alignItems: "center", gap: 14 }}>
            <span
              style={{ width: 62, height: 62, borderRadius: "50%", background: "linear-gradient(150deg,#E79A3C,#F6C177)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.6rem", border: "4px solid rgba(255,255,255,0.5)" }}
              aria-hidden="true"
            >
              {previewInitial}
            </span>
            <div>
              <p style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 800, fontSize: "1.4rem", color: "#fff" }}>{name.trim() || "New member"}</p>
              <span style={{ display: "inline-block", marginTop: 4, padding: "4px 11px", borderRadius: 999, background: "rgba(255,255,255,0.25)", color: "#fff", fontWeight: 800, fontSize: "0.74rem" }}>
                {(relationship.trim() || "Relationship") + " to the baby"}
              </span>
            </div>
          </div>
          <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
            <Row k="Baby calls them" v={babyCalls.trim() ? `“${babyCalls.trim()}”` : "—"} color="#6A55C9" />
            <div style={{ height: 1, background: "#F0E6D2" }} />
            <Row k="They call the baby" v={theyCallBaby.trim() ? `“${theyCallBaby.trim()}”` : "—"} color="#E79A3C" />
            <div style={{ height: 1, background: "#F0E6D2" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem" }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: enough ? "#5FB389" : "#C9A9A9" }} />
              <span style={{ color: "#6E6076", fontWeight: 700 }}>{enough ? "Ready to train likeness" : "Needs photos"}</span>
            </div>
          </div>
        </div>
        <div style={{ background: "#FBF4E7", border: "1px solid #F0E6D2", borderRadius: 18, padding: 16, display: "flex", gap: 11, alignItems: "flex-start" }}>
          <span style={{ fontSize: "1.2rem" }} aria-hidden="true">🔒</span>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#6E6076" }}>
            Photos &amp; trained models are encrypted, private to your family, and never used to train anything but this person.
          </p>
        </div>
      </aside>
    </div>
  );
}

function KindChip({ active, onClick, icon, text }: { active: boolean; onClick: () => void; icon: string; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 999, border: `1.5px solid ${active ? "#8B6DF0" : "#ECE1CE"}`, background: active ? "#EDE7FE" : "#FFFDF9", color: active ? "#6A55C9" : "#6E6076", fontWeight: 800, fontSize: "0.95rem", cursor: "pointer", fontFamily: "var(--v2-font-body)" }}
    >
      <span style={{ fontSize: "1.15rem" }} aria-hidden="true">{icon}</span>
      <span>{text}</span>
    </button>
  );
}

function Row({ k, v, color }: { k: string; v: string; color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "0.9rem" }}>
      <span style={{ color: "#9A8A78" }}>{k}</span>
      <span style={{ fontFamily: "var(--v2-font-display)", fontWeight: 700, color }}>{v}</span>
    </div>
  );
}
