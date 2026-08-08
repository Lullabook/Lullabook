import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { requireAuthedContext } from "@/lib/auth";
import {
  inviteMemberFormAction,
  removeMemberFormAction,
  startCheckoutFormAction,
  cancelSubscriptionFormAction,
} from "@/lib/actions";
import { signOutAction } from "@/lib/auth-actions";
import { ConsentEngine } from "@/services/consent-engine";
import { HardDeleteConfirm } from "@/components/hard-delete-confirm";
import { BabyBirthdateForm } from "@/components/baby-birthdate-form";
import { SubmitButton } from "@/components/submit-button";
import { AVATAR_GRADIENTS } from "@/components/v2/tokens";

export const metadata: Metadata = { title: "Account" };

// TODO: point at real subscription data when available.
const PLAN = { name: "Illustrated plan", price: "$12 / month", renews: "renews Jul 7, 2026" };

const PLAN_PERKS = [
  { icon: "🎨", title: "Illustrated personas", note: "Family drawn as themselves" },
  { icon: "🎙️", title: "Real voices", note: "They read every page" },
  { icon: "📚", title: "Unlimited stories", note: "Make as many as you like" },
  { icon: "⬇️", title: "PDF & print export", note: "Keep them forever" },
];

const PRIVACY_POINTS = [
  "Photos and likeness models are encrypted and never shared.",
  "Storybooks are private to your family unless you mint a share link.",
  "Canceling starts a 30-day export window before everything is purged.",
];

const card: CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 22,
  boxShadow: "0 8px 22px rgba(58,40,80,0.07)",
};
const sectionTitle: CSSProperties = {
  margin: "0 0 6px",
  fontFamily: "var(--v2-font-display)",
  fontWeight: 700,
  fontSize: "1.3rem",
  color: "#2E2438",
};

export default async function AccountPage() {
  const { ctx, member } = await requireAuthedContext();
  const members = ctx.store.getMembersByFamily(member.familyId);
  const invites = [...ctx.store.invites.values()].filter((i) => i.familyId === member.familyId);
  const jurisdiction = ConsentEngine.getJurisdiction(member.jurisdiction);
  const isGuardian = member.role === "guardian";
  const subscribed = ctx.subscriptions.isActive(member.familyId);
  const initial = member.email[0]?.toUpperCase() ?? "?";
  const baby = ctx.babies.getSelected(member.id) ?? ctx.babies.ensureDefaultBaby(member.id);
  const babies = ctx.babies.list(member.id);

  return (
    <div className="v2-stack" style={{ gap: 22 }}>
      <div>
        <p className="v2-eyebrow">⚙️ Your account</p>
        <h1 className="v2-page-title">Account &amp; family settings</h1>
      </div>

      {/* profile header */}
      <div style={{ ...card, padding: 0, borderRadius: 26, overflow: "hidden", boxShadow: "0 12px 32px rgba(58,40,80,0.08)" }}>
        <div
          style={{
            padding: 26,
            background: "linear-gradient(135deg,#6A55C9 0%,#B5739E 52%,#F0A878 100%)",
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              width: 78,
              height: 78,
              borderRadius: "50%",
              background: "linear-gradient(150deg,#E78AA0,#8B6DF0)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontFamily: "var(--v2-font-display)",
              fontWeight: 700,
              fontSize: "2rem",
              boxShadow: "0 8px 20px rgba(58,40,80,0.18)",
              border: "4px solid rgba(255,255,255,0.55)",
            }}
            aria-hidden="true"
          >
            {initial}
          </span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h2 style={{ margin: 0, fontFamily: "var(--v2-font-display)", fontWeight: 800, fontSize: "1.7rem", color: "#fff" }}>
              {member.email}
            </h2>
            <p style={{ margin: "4px 0 0", color: "#FBEAF3", fontSize: "0.95rem" }}>
              {isGuardian ? "Guardian" : "Member"} of your family
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ padding: "5px 12px", borderRadius: 999, background: "rgba(255,255,255,0.95)", color: "#8C611B", fontWeight: 800, fontSize: "0.8rem" }}>
                {subscribed ? "✨ Illustrated plan" : "Free plan"}
              </span>
            </div>
          </div>
          <form action={signOutAction}>
            <SubmitButton
              className="v2-btn"
              label="Sign out"
              // @ts-expect-error SubmitButton forwards style to the underlying button
              style={{ background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.5)" }}
            />
          </form>
        </div>
      </div>

      {/* little one — birthday for future Birthday Story offers (issue 64) */}
      <div style={card}>
        <h3 style={sectionTitle}>👶 Your little one</h3>
        <p style={{ margin: "0 0 16px", color: "#6E6076", fontSize: "0.92rem", lineHeight: 1.5 }}>
          {babies.length > 1
            ? `Editing ${baby.displayName} (selected). Switch babies from World when multi-baby is wired in UI.`
            : `${baby.displayName} is the star of your world.`}
        </p>
        <BabyBirthdateForm
          babyId={baby.id}
          babyName={baby.displayName}
          birthDate={baby.birthDate}
          canEdit={isGuardian}
        />
      </div>

      {/* plan & billing */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h3 style={sectionTitle}>{subscribed ? `✨ ${PLAN.name}` : "Free plan"}</h3>
            <p style={{ margin: 0, color: "#6E6076", fontSize: "0.95rem" }}>
              {subscribed ? `${PLAN.price} · ${PLAN.renews}` : "Upgrade to draw your family and hear their voices."}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {subscribed ? (
              <form action={cancelSubscriptionFormAction}>
                <SubmitButton className="v2-btn v2-btn--ghost-surface" label="Manage billing" />
              </form>
            ) : (
              <form action={startCheckoutFormAction}>
                <SubmitButton className="v2-btn v2-btn--amber" label="✨ Upgrade to Illustrated" />
              </form>
            )}
          </div>
        </div>
        <div style={{ height: 1, background: "#F0E6D2", margin: "18px 0" }} />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px,1fr))" }}>
          {PLAN_PERKS.map((p) => (
            <div key={p.title} style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "#FBF4E7", border: "1px solid #F0E6D2", borderRadius: 16, padding: 14 }}>
              <span style={{ fontSize: "1.1rem", lineHeight: 1.2 }} aria-hidden="true">{p.icon}</span>
              <div>
                <p style={{ margin: 0, fontWeight: 800, fontSize: "0.92rem", color: "#2E2438" }}>{p.title}</p>
                <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#9A8A78" }}>{p.note}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* family members */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
          <h3 style={{ ...sectionTitle, margin: 0 }}>💛 Family members</h3>
          <span style={{ fontSize: "0.85rem", color: "#9A8A78", fontWeight: 700 }}>Who can see &amp; help build your world</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {members.map((m, i) => {
            const mGuardian = m.role === "guardian";
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 13, padding: "12px 14px", borderRadius: 16, border: "1px solid #ECE1CE", background: "#FBF4E7" }}>
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#fff",
                    fontFamily: "var(--v2-font-display)",
                    fontWeight: 700,
                    fontSize: "1.1rem",
                  }}
                  aria-hidden="true"
                >
                  {m.email[0]?.toUpperCase() ?? "?"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 800, fontSize: "0.95rem", color: "#2E2438" }}>{m.email}</p>
                  <p style={{ margin: "1px 0 0", fontSize: "0.82rem", color: "#9A8A78" }}>
                    {mGuardian ? "Guardian" : "Member"}{m.id === member.id ? " · you" : ""}
                  </p>
                </div>
                <span style={{ padding: "4px 11px", borderRadius: 999, background: mGuardian ? "#EDE7FE" : "#FBF4E7", color: mGuardian ? "#6A55C9" : "#9A8A78", fontWeight: 800, fontSize: "0.74rem", flexShrink: 0 }}>
                  {mGuardian ? "Guardian" : "Member"}
                </span>
                {isGuardian && m.id !== member.id && (
                  <form action={removeMemberFormAction.bind(null, m.id)}>
                    <SubmitButton className="v2-btn v2-btn--danger-ghost" label="Remove" pendingLabel="Removing…" />
                  </form>
                )}
              </div>
            );
          })}
        </div>

        {isGuardian && (
          <>
            <div style={{ height: 1, background: "#F0E6D2", margin: "18px 0" }} />
            <p style={{ margin: "0 0 10px", fontFamily: "var(--v2-font-display)", fontWeight: 700, fontSize: "1.05rem", color: "#2E2438" }}>
              Invite someone who loves them
            </p>
            <form action={inviteMemberFormAction} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <input
                type="email"
                name="email"
                placeholder="grandma@example.com"
                aria-label="Email to invite"
                required
                style={{ flex: 1, minWidth: 220, fontSize: "1rem", color: "#2E2438", background: "#FBF4E7", border: "1px solid #ECE1CE", borderRadius: 14, padding: "13px 15px", boxSizing: "border-box" }}
              />
              <SubmitButton className="v2-btn v2-btn--primary" label="Send invite" pendingLabel="Inviting…" />
            </form>
            {invites.length > 0 && (
              <p style={{ marginTop: 10, fontSize: "0.85rem", color: "#9A8A78" }}>
                Pending invites: {invites.map((i) => i.email).join(", ")}
              </p>
            )}
          </>
        )}
      </div>

      {/* privacy */}
      <div style={card}>
        <h3 style={sectionTitle}>🔒 Privacy &amp; your data</h3>
        <p style={{ margin: "0 0 14px", color: "#6E6076", fontSize: "0.92rem" }}>
          Jurisdiction <strong style={{ color: "#2E2438" }}>{jurisdiction?.code ?? member.jurisdiction}</strong> · notice v
          {jurisdiction?.noticeVersion ?? "—"}. Consent rules and data residency follow your region.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PRIVACY_POINTS.map((pt) => (
            <div key={pt} style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#E1F1E8", color: "#3C7556", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", flexShrink: 0, fontWeight: 800 }} aria-hidden="true">✓</span>
              <p style={{ margin: 0, color: "#6E6076", fontSize: "0.92rem" }}>{pt}</p>
            </div>
          ))}
        </div>
      </div>

      {/* danger */}
      {isGuardian && (
        <div style={{ ...card, border: "1px solid #ECCDD2", boxShadow: "0 8px 22px rgba(178,58,72,0.06)" }}>
          <h3 style={{ ...sectionTitle, color: "#B23A48" }}>Delete everything</h3>
          <p style={{ margin: "0 0 16px", color: "#6E6076", fontSize: "0.92rem", maxWidth: 620 }}>
            The right to be forgotten, for real: photos, trained likeness models, storybooks, stories, and account data
            are erased from our database and file storage. This cannot be undone.
          </p>
          <HardDeleteConfirm />
        </div>
      )}
    </div>
  );
}
