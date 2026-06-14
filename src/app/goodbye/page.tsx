import Link from "next/link";
import type { Metadata } from "next";
import { Baloo_2, Nunito } from "next/font/google";

export const metadata: Metadata = { title: "Goodbye" };

const baloo = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-baloo",
});

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
});

export default function GoodbyePage() {
  return (
    <div className={`${baloo.variable} ${nunito.variable}`}>
      <main
        className="v2-shell"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "10vh 22px" }}
      >
        <div
          style={{
            position: "relative",
            zIndex: 1,
            maxWidth: 520,
            textAlign: "center",
            background: "#FFFDF9",
            border: "1px solid #ECE1CE",
            borderRadius: 26,
            boxShadow: "0 12px 32px rgba(58,40,80,0.08)",
            padding: "44px 32px",
          }}
        >
          <span style={{ fontSize: "2.8rem", display: "block", marginBottom: 16 }} aria-hidden="true">
            🌙
          </span>
          <h1
            style={{
              fontFamily: "var(--v2-font-display)",
              fontWeight: 800,
              fontSize: "2rem",
              letterSpacing: "-0.02em",
              color: "#2E2438",
              margin: "0 0 12px",
            }}
          >
            Everything has been deleted
          </h1>
          <p style={{ color: "#6E6076", fontSize: "1.02rem", lineHeight: 1.6, margin: "0 auto 26px", maxWidth: 440 }}>
            Your family&apos;s photos, family members, trained models, storybooks,
            and account data are gone — really gone, from our database and our file
            storage alike. Thank you for trusting us with your bedtime stories.
          </p>
          <Link className="v2-btn v2-btn--primary" href="/">
            Back to the start
          </Link>
        </div>
      </main>
    </div>
  );
}
