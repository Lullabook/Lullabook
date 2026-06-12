import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Goodbye" };

export default function GoodbyePage() {
  return (
    <main className="shell" style={{ paddingTop: "14vh" }}>
      <div className="empty-state">
        <span className="moon" aria-hidden="true">
          🌙
        </span>
        <h1>Everything has been deleted</h1>
        <p className="muted" style={{ maxWidth: 440, margin: "0 auto 2rem" }}>
          Your Family&apos;s photos, personas, trained models, storybooks, and
          account data are gone — really gone, from our database and our file
          storage alike. Thank you for trusting us with your bedtime stories.
        </p>
        <Link className="btn btn-ghost" href="/">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
