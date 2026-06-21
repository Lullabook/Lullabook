import Link from "next/link";
import type { Dashboard, DashboardCard } from "@/services/home-dashboard";

const cardStyle: React.CSSProperties = {
  background: "#FFFDF9",
  border: "1px solid #ECE1CE",
  borderRadius: 22,
  padding: 20,
  boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
};

const cardIconBg: Record<string, string> = {
  "continue-reading": "linear-gradient(135deg,#8B6DF0,#6A55C9)",
  "story-nudge": "linear-gradient(135deg,#F6C177,#E79A3C)",
  "this-week": "linear-gradient(135deg,#5FB389,#9FD8B1)",
  "family-activity": "linear-gradient(135deg,#E78AA0,#F2A6B8)",
};

const cardIcon: Record<string, string> = {
  "continue-reading": "📖",
  "story-nudge": "✨",
  "this-week": "📊",
  "family-activity": "💛",
};

function DashboardCard({ card }: { card: DashboardCard }) {
  const icon = cardIcon[card.kind] ?? "📚";
  const iconBg = cardIconBg[card.kind] ?? "linear-gradient(135deg,#8B6DF0,#6A55C9)";

  const inner = (
    <>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.3rem",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontFamily: "var(--v2-font-display)",
            fontWeight: 700,
            fontSize: "1.05rem",
            color: "#2E2438",
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {card.title}
        </p>
        {card.subtitle && (
          <p
            style={{
              margin: "4px 0 0",
              color: "#6E6076",
              fontSize: "0.85rem",
              lineHeight: 1.35,
            }}
          >
            {card.subtitle}
          </p>
        )}
      </div>
    </>
  );

  if (card.href) {
    return (
      <Link href={card.href} style={{ ...cardStyle, display: "flex", gap: 14, alignItems: "center", textDecoration: "none", cursor: "pointer" }}>
        {inner}
      </Link>
    );
  }

  return (
    <div style={{ ...cardStyle, display: "flex", gap: 14, alignItems: "center" }}>
      {inner}
    </div>
  );
}

export function HomeDashboard({ dashboard }: { dashboard: Dashboard }) {
  const { hero, cards } = dashboard;

  return (
    <div className="v2-stack" style={{ gap: 18 }}>
      <section className="v2-hero">
        <span
          className="v2-hero__twinkle"
          style={{ top: 34, left: 60, width: 6, height: 6 }}
          aria-hidden="true"
        />
        <span
          className="v2-hero__twinkle"
          style={{
            top: 70,
            right: 90,
            width: 5,
            height: 5,
            background: "#FFF3D6",
            animationDelay: "0.5s",
          }}
          aria-hidden="true"
        />
        <span
          className="v2-hero__twinkle"
          style={{
            bottom: 40,
            left: 120,
            width: 5,
            height: 5,
            animationDelay: "1s",
          }}
          aria-hidden="true"
        />

        <p className="v2-hero__eyebrow">✨ A growing world starring</p>
        <div className="v2-hero__star" aria-hidden="true">
          {hero.babyInitial}
        </div>
        <h1 className="v2-hero__title">{hero.babyName}&apos;s World</h1>
        <p className="v2-hero__lead">
          A whole world of stories starring {hero.babyName} — and everyone who
          loves them. Built page by page, voice by voice.
        </p>
        <Link className="v2-btn v2-btn--cream" href={hero.primaryCta.href} style={{ marginTop: 24 }}>
          ✨ {hero.primaryCta.label}
        </Link>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 14,
        }}
      >
        {cards.map((card) => (
          <DashboardCard key={card.kind} card={card} />
        ))}
      </div>
    </div>
  );
}
