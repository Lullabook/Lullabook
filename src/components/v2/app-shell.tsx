import Link from "next/link";
import { NavLinks } from "@/components/nav-links";

interface AppShellProps {
  children: React.ReactNode;
  userInitial: string;
  illustrated?: boolean;
}

export function AppShell({ children, userInitial, illustrated }: AppShellProps) {
  return (
    <div className="v2-shell">
      <div className="v2-blob v2-blob--purple" aria-hidden="true" />
      <div className="v2-blob v2-blob--amber" aria-hidden="true" />

      <header className="v2-header">
        <div className="v2-header__inner">
          <Link href="/world" className="v2-brand">
            <span className="v2-brand__icon" aria-hidden="true">
              ☀️
            </span>
            <span className="v2-brand__name">Lullabook</span>
          </Link>

          <nav className="v2-pill-nav" aria-label="Primary">
            <NavLinks />
          </nav>

          <div className="v2-header__meta">
            {illustrated && (
              <span className="v2-badge-illustrated">✨ Illustrated</span>
            )}
            <Link
              href="/account"
              className="v2-avatar-user"
              aria-label="Account"
            >
              {userInitial}
            </Link>
          </div>
        </div>
      </header>

      <main className="v2-main">{children}</main>
    </div>
  );
}
