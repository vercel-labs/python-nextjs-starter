import type { CSSProperties } from "react";
import type { Book } from "@/lib/types";
export function BookCover({
  book,
  large = false,
}: {
  book: Book;
  large?: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className={`book-cover ${large ? "large" : ""}`}
      style={{ backgroundColor: book.cover_color, color: coverText(book.cover_color) } as CSSProperties}
    >
      <div className="cover-top">
        MARGIN EDITIONS <span>№ {book.published_year}</span>
      </div>
      <div className="cover-title">{book.title}</div>
      <div className="cover-author">{book.author}</div>
    </div>
  );
}

// Choose readable cover lettering for colors entered by shop administrators.
function coverText(hex: string) {
  const rgb = hex.replace("#", "").match(/.{2}/g)?.map((v) => {
    const c = parseInt(v, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  if (!rgb || rgb.length !== 3) return "#fff";
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return luminance > 0.198 ? "#171717" : "#fff";
}
