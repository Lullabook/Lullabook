"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { V2_NAV } from "@/components/v2/tokens";
import { tabForPath } from "@/components/nav-links";

export function V2Nav() {
  const pathname = usePathname();

  return (
    <nav className="v2-nav" aria-label="Primary">
      {V2_NAV.map((item) => {
        const active = tabForPath(pathname) === item.label;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`v2-nav-link${active ? " v2-nav-link--active" : ""}`}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
