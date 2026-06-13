import Link from "next/link";
import { V2Nav } from "@/components/v2/v2-nav";

export function V2Header() {
  return (
    <header className="v2-topbar">
      <div className="v2-topbar-inner">
        <Link href="/world" className="v2-brand">
          <span className="v2-brand-icon" aria-hidden="true">
            ☀️
          </span>
          <span className="v2-brand-text">Lullabook</span>
        </Link>
        <V2Nav />
        <div className="v2-topbar-actions">
          <span className="v2-tier-badge">✨ Illustrated</span>
          <Link href="/account" className="v2-avatar" aria-label="Account">
            A
          </Link>
        </div>
      </div>
    </header>
  );
}
