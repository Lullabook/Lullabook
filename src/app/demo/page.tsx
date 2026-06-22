import type { Metadata } from "next";
import Link from "next/link";
import { DemoStoryService } from "@/services/first-open";

export const metadata: Metadata = { title: "Demo Story" };

export default function DemoPage() {
  const svc = new DemoStoryService();
  const demo = svc.getDemoStory();

  return (
    <div className="v2-stack" style={{ gap: 22, maxWidth: 640, margin: "0 auto" }}>
      <div style={{ textAlign: "center" }}>
        <p className="v2-eyebrow" style={{ color: "#8B6DF0" }}>
          ✨ Demo Story
        </p>
        <h1
          style={{
            fontFamily: "var(--v2-font-display)",
            fontWeight: 800,
            fontSize: "2.3rem",
            margin: 0,
            color: "#2E2438",
            letterSpacing: "-0.02em",
          }}
        >
          {demo.title}
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            color: "#6E6076",
            fontSize: "1rem",
          }}
        >
          Read this story in under 90 seconds — no signup needed.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {demo.characters.map((c) => (
          <span
            key={c.name}
            style={{
              padding: "6px 14px",
              borderRadius: 999,
              background: "#FFF8EC",
              border: "1px solid #ECE1CE",
              color: "#6E6076",
              fontSize: "0.82rem",
              fontWeight: 700,
            }}
          >
            {c.name}
          </span>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {demo.pages.map((page, i) => (
          <div
            key={i}
            style={{
              background: "#FFFDF9",
              border: "1px solid #ECE1CE",
              borderRadius: 22,
              padding: 24,
              boxShadow: "0 8px 24px rgba(58,40,80,0.06)",
            }}
          >
            <div
              style={{
                width: "100%",
                aspectRatio: "4 / 3",
                borderRadius: 18,
                background: "linear-gradient(160deg,#4a7f5a,#e8c46a)",
                marginBottom: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
              }}
              aria-hidden="true"
            >
              {i === 0 ? "🌙" : i === 1 ? "⭐" : i === 2 ? "😴" : "✨"}
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: "var(--v2-font-display)",
                fontWeight: 600,
                fontSize: "1.15rem",
                color: "#2E2438",
                lineHeight: 1.5,
                textAlign: "center",
              }}
            >
              {page.text}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          background: "linear-gradient(135deg,#6A55C9 0%,#B5739E 48%,#F0A878 100%)",
          borderRadius: 28,
          padding: 32,
          textAlign: "center",
          boxShadow: "0 22px 50px rgba(106,85,201,0.3)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--v2-font-display)",
            fontWeight: 800,
            fontSize: "1.6rem",
            margin: "0 0 8px",
            color: "#FBEAF3",
          }}
        >
          Put your baby in the story ✨
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            color: "#FFE9C9",
            fontSize: "0.95rem",
            lineHeight: 1.5,
          }}
        >
          Start your 7-day free trial of Normal. Your card stays on file as
          parental consent — cancel anytime.
        </p>
        <Link
          href="/sign-up"
          className="v2-btn v2-btn--cream"
          style={{ fontSize: "1rem", padding: "14px 28px" }}
        >
          Start your free trial
        </Link>
        <p
          style={{
            margin: "12px 0 0",
            color: "rgba(251,234,243,0.7)",
            fontSize: "0.78rem",
          }}
        >
          Annual billing default · $15/mo after trial · No child likeness without it
        </p>
      </div>

      <div style={{ textAlign: "center" }}>
        <Link
          href="/sign-in"
          style={{
            color: "#6E6076",
            fontSize: "0.85rem",
            fontWeight: 700,
            textDecoration: "underline",
          }}
        >
          Already have an account? Sign in →
        </Link>
      </div>
    </div>
  );
}
