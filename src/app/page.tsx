import Link from "next/link";
import { getAuthedContext } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const authed = await getAuthedContext();
  if (authed) redirect("/library");

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#FBF4E7",
        fontFamily: "var(--v2-font-body)",
        color: "#2E2438",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10vh 24px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 600, textAlign: "center" }}>
        <span aria-hidden="true" style={{ fontSize: "3.4rem", display: "block", marginBottom: 12 }}>
          🌙
        </span>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.16em", fontSize: "0.74rem", fontWeight: 800, color: "#8B6DF0", margin: "0 0 10px" }}>
          Bedtime, starring your family
        </p>
        <h1 style={{ fontFamily: "var(--v2-font-display)", fontWeight: 800, fontSize: "2.6rem", lineHeight: 1.12, letterSpacing: "-0.02em", color: "#2E2438", margin: "0 0 18px" }}>
          Storybooks where your little one
          <br />
          is the hero of every page
        </h1>
        <p style={{ color: "#6E6076", fontSize: "1.05rem", lineHeight: 1.55, maxWidth: 480, margin: "0 auto 2rem" }}>
          Lullabook writes and illustrates keepsake storybooks starring your
          baby, your family, and the people they love — gentle stories for
          bedtime, little lessons for daytime.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link className="v2-btn v2-btn--primary" href="/sign-up">
            Start free — no photos needed
          </Link>
          <Link className="v2-btn v2-btn--ghost-surface" href="/sign-in">
            Sign in
          </Link>
        </div>
        <p style={{ marginTop: "2rem", fontSize: "0.86rem", color: "#9A8A78", lineHeight: 1.6 }}>
          Free tier: describe a character, get a personalized story tonight.
          <br />
          Private by default. Hard-delete anytime — photos, models, everything.
        </p>
      </div>
    </main>
  );
}
