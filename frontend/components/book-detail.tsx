import Link from "next/link";
import type { ReactNode } from "react";
import type { Book } from "@/lib/types";
import { price } from "@/lib/types";
import { BookCover } from "./book-cover";

export function BookDetail({
  initialBook: book,
  children,
}: {
  initialBook: Book | null;
  children?: ReactNode;
}) {
  if (!book)
    return (
      <main id="main" className="page-shell empty-state">
        <h1>We couldn’t find that book.</h1>
        <p>It may have been removed from the collection.</p>
        <Link className="primary-button" href="/">
          Back to the collection
        </Link>
      </main>
    );
  return (
    <main id="main" className="page-shell">
      <Link className="back-link" href="/">
        ← Back to the collection
      </Link>
      <div className="detail-layout">
        <div className="detail-cover">
          <BookCover book={book} large />
        </div>
        <div className="detail-copy">
          <p className="eyebrow">
            {book.category} / {book.published_year}
          </p>
          <h1>{book.title}</h1>
          <p className="detail-author">by {book.author}</p>
          <p className="detail-description">{book.description}</p>
          <div className="detail-price">
            <strong>{price(book.price_cents)}</strong>
            <span>
              {book.stock
                ? `${book.stock} copies in stock`
                : "Currently out of stock"}
            </span>
          </div>
          {children}
          <p className="muted">
            A catalog demo. Books are fictional; purchases are unavailable.
          </p>
        </div>
      </div>
    </main>
  );
}
