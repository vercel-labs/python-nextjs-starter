import Link from "next/link";
import type { Book } from "@/lib/types";
import { price } from "@/lib/types";
import { BookCover } from "./book-cover";
export function BookCard({ book }: { book: Book }) {
  return (
    <article className="book-card">
      <Link
        prefetch={true}
        className="book-image"
        href={`/books/${book.id}`}
        aria-label={`Explore ${book.title} by ${book.author}`}
      >
        <BookCover book={book} />
        <span className="book-arrow" aria-hidden="true">
          ↗
        </span>
      </Link>
      <div className="book-meta">
        <span>{book.category}</span>
        <span>{price(book.price_cents)}</span>
      </div>
      <h3>
        <Link prefetch={true} href={`/books/${book.id}`}>{book.title}</Link>
      </h3>
      <p>{book.author}</p>
    </article>
  );
}
