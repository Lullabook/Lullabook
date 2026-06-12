import Link from "next/link";
import { getAuthedContext } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const authed = await getAuthedContext();
  if (authed) redirect("/library");

  return (
    <main className="shell" style={{ paddingTop: "10vh" }}>
      <div className="empty-state">
        <span className="moon" aria-hidden="true">
          🌙
        </span>
        <p className="eyebrow">Bedtime, starring your family</p>
        <h1>
          Storybooks where your little one
          <br />
          is the hero of every page
        </h1>
        <p className="muted" style={{ maxWidth: 480, margin: "0 auto 2rem" }}>
          Lullabook writes and illustrates keepsake storybooks starring your
          baby, your family, and the people they love — gentle stories for
          bedtime, little lessons for daytime.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary" href="/sign-up">
            Start free — no photos needed
          </Link>
          <Link className="btn btn-ghost" href="/sign-in">
            Sign in
          </Link>
        </div>
        <p className="subtle" style={{ marginTop: "2rem" }}>
          Free tier: describe a character, get a personalized story tonight.
          <br />
          Private by default. Hard-delete anytime — photos, models, everything.
        </p>
      </div>
    </main>
  );
}
