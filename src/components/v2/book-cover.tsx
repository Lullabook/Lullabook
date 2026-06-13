import Link from "next/link";
import type { StorybookStatus } from "@/domain/types";
import {
  bookCoverPalette,
  bookStatusClass,
  bookStatusLabel,
  type BookCoverPalette,
} from "@/lib/v2-theme";

export interface BookCoverProps {
  title: string;
  status: StorybookStatus;
  href: string;
  cast?: string;
  date?: string;
  palette?: BookCoverPalette;
  seed?: string;
}

export function BookCover({
  title,
  status,
  href,
  cast,
  date,
  palette,
  seed = title,
}: BookCoverProps) {
  const colors = palette ?? bookCoverPalette(seed);

  return (
    <div className="v2-book-card">
      <Link
        href={href}
        className="v2-book-cover"
        style={{ background: colors.sky }}
      >
        <span
          className="v2-book-cover__moon"
          style={{ background: colors.moon }}
          aria-hidden="true"
        />
        <span
          className="v2-book-cover__hill"
          style={{ background: colors.hill }}
          aria-hidden="true"
        />
        <span
          className="v2-book-cover__hill2"
          style={{ background: colors.hill2 }}
          aria-hidden="true"
        />
        <span className="v2-book-cover__shade" aria-hidden="true" />
        <span className={`v2-book-cover__badge ${bookStatusClass(status)}`}>
          {bookStatusLabel(status)}
        </span>
        <span className="v2-book-cover__title">{title}</span>
      </Link>
      {(cast || date) && (
        <div className="v2-book-card__meta">
          {cast && <span className="v2-book-card__cast">{cast}</span>}
          {date && <span className="v2-book-card__date">{date}</span>}
        </div>
      )}
    </div>
  );
}
