import Link from "next/link";
import type { Storybook } from "@/domain/types";
import { AVATAR_GRADIENTS, bookSky, statusBadge } from "@/components/v2/tokens";

export function V2BookCover({
  book,
  href,
  index = 0,
}: {
  book: Storybook;
  href: string;
  index?: number;
}) {
  const { label, className } = statusBadge(book.status);
  const title = book.brief.theme || "Untitled story";

  return (
    <div className="v2-book-card">
      <Link
        href={href}
        className="v2-book-cover"
        style={{ background: bookSky(index) }}
      >
        <span className={`v2-book-badge ${className}`}>{label}</span>
        <span className="v2-book-title">{title}</span>
      </Link>
    </div>
  );
}

export function V2AvatarRing({
  items,
}: {
  items: {
    id: string;
    name: string;
    role: string;
    initial: string;
    badge: string;
    avBg?: string;
  }[];
}) {
  return (
    <div className="v2-avatar-ring">
      {items.map((a, i) => (
        <div key={a.id} className="v2-avatar-item">
          <div
            className="v2-avatar-circle"
            style={{ background: a.avBg ?? AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
          >
            {a.initial}
            <span className="v2-avatar-badge">{a.badge}</span>
          </div>
          <span style={{ fontSize: "0.8rem", fontWeight: 800, textAlign: "center" }}>
            {a.name}
          </span>
          <span style={{ fontSize: "0.68rem", color: "#9A8A78", textAlign: "center" }}>
            {a.role}
          </span>
        </div>
      ))}
    </div>
  );
}
