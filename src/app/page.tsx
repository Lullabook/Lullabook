import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Lullabook</h1>
      <p>AI storybooks starring your baby and family.</p>
      <Link href="/roster">View your Persona roster</Link>
    </main>
  );
}
