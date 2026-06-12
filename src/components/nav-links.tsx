"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/library", label: "Library", icon: "📚" },
  { href: "/storybooks/new", label: "Create", icon: "✨" },
  { href: "/personas", label: "Personas", icon: "🧸" },
  { href: "/stories", label: "Stories", icon: "📖" },
  { href: "/account", label: "Account", icon: "🌙" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={
            pathname === link.href || pathname.startsWith(`${link.href}/`)
              ? "page"
              : undefined
          }
        >
          <span className="nav-icon" aria-hidden="true">
            {link.icon}
          </span>
          {link.label}
        </Link>
      ))}
    </>
  );
}
