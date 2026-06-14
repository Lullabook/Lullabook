"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/world", label: "World", icon: "☀️" },
  { href: "/stories", label: "Stories", icon: "📚" },
  { href: "/storybooks/new", label: "Create", icon: "✨" },
  { href: "/family", label: "Family", icon: "💛" },
  { href: "/characters", label: "Characters", icon: "🐻" },
  { href: "/daily", label: "Daily", icon: "📔" },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/world") return pathname === "/world" || pathname === "/library";
  if (href === "/storybooks/new") {
    return pathname === "/storybooks/new" || pathname.startsWith("/storybooks/new/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(pathname, link.href) ? "page" : undefined}
        >
          <span aria-hidden="true">{link.icon}</span>
          {link.label}
        </Link>
      ))}
    </>
  );
}
