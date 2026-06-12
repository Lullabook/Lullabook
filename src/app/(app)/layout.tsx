import Link from "next/link";
import { requireAuthedContext } from "@/lib/auth";
import { NavLinks } from "@/components/nav-links";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuthedContext();
  return (
    <>
      <header className="topbar">
        <Link href="/library" className="brand">
          <span aria-hidden="true">🌙</span> Lullabook
        </Link>
        <nav className="nav" aria-label="Primary">
          <NavLinks />
        </nav>
      </header>
      <main className="shell">{children}</main>
    </>
  );
}
