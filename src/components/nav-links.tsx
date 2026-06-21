"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabLink {
  href: string;
  label: string;
  icon: string;
}

export const FIVE_TABS: TabLink[] = [
  { href: "/world", label: "Home", icon: "☀️" },
  { href: "/stories", label: "Stories", icon: "📚" },
  { href: "/storybooks/new", label: "Create", icon: "✨" },
  { href: "/family", label: "Family", icon: "💛" },
  { href: "/account", label: "Settings", icon: "⚙️" },
];

/** Resolve the active tab label for a given pathname (issue 96). */
export function tabForPath(pathname: string): string | null {
  if (
    pathname === "/world" ||
    pathname === "/library" ||
    pathname === "/daily" ||
    pathname.startsWith("/daily/")
  ) {
    return "Home";
  }
  if (pathname === "/stories" || pathname.startsWith("/stories/")) {
    return "Stories";
  }
  if (
    pathname === "/storybooks" ||
    (pathname.startsWith("/storybooks/") && !pathname.startsWith("/storybooks/new"))
  ) {
    return "Stories";
  }
  if (pathname === "/storybooks/new" || pathname.startsWith("/storybooks/new/")) {
    return "Create";
  }
  if (
    pathname === "/family" ||
    pathname.startsWith("/family/") ||
    pathname === "/characters" ||
    pathname.startsWith("/characters/") ||
    pathname === "/personas" ||
    pathname.startsWith("/personas/")
  ) {
    return "Family";
  }
  if (
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/billing" ||
    pathname.startsWith("/billing/")
  ) {
    return "Settings";
  }
  return null;
}

function isActive(pathname: string, href: string, label: string): boolean {
  return tabForPath(pathname) === label;
}

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {FIVE_TABS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={isActive(pathname, link.href, link.label) ? "page" : undefined}
        >
          <span aria-hidden="true">{link.icon}</span>
          {link.label}
        </Link>
      ))}
    </>
  );
}
