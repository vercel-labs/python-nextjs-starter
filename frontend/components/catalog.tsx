"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Book } from "@/lib/types";
import { categories } from "@/lib/types";
import { BookCard } from "./book-card";

export function Catalog({
  initialBooks,
  initialError,
  onRetry,
}: {
  initialBooks: Book[];
  initialError: boolean;
  onRetry?: () => void;
}) {
  const books = initialBooks;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const error = initialError;
  const searchParams = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const selectedCategory = searchParams.get("category") ?? "All books";
  const category = categories.includes(selectedCategory) ? selectedCategory : "All books";
  function updateFilters(patch: { q?: string; category?: string }) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value || value === "All books") next.delete(key);
      else next.set(key, value);
    }
    const queryString = next.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`);
  }
  const visible = books.filter(
    (book) =>
      (category === "All books" || book.category === category) &&
      `${book.title} ${book.author}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function retry() {
    startTransition(() => {
      if (onRetry) onRetry();
      else router.refresh();
    });
  }
  return (
    <>
      <section id="collection" className="collection">
        <div className="collection-title">
          <div>
            <h2>Find your next chapter.</h2>
          </div>
          <label className="search">
            <span className="sr-only">Search books or authors</span>
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => updateFilters({ q: event.target.value })}
              name="q"
              autoComplete="off"
              placeholder="Search books or authors…"
            />
          </label>
        </div>
        <div className="collection-filters">
          <div className="category-tabs" aria-label="Book categories">
            {["All books", ...categories].map((item) => (
              <button
                key={item}
                aria-pressed={category === item}
                onClick={() => updateFilters({ category: item })}
              >
                {item}
              </button>
            ))}
          </div>
          <span className="result-count" aria-live="polite">
            {visible.length} {visible.length === 1 ? "book" : "books"}
          </span>
        </div>
        {error ? (
          <div className="empty-state" role="alert">
            <h3>The shelves are taking a moment.</h3>
            <p>We couldn’t load the collection. Please try again.</p>
            <button className="primary-button" disabled={pending} onClick={retry}>
              {pending ? "Trying again…" : "Try again"}
            </button>
          </div>
        ) : visible.length ? (
          <div className="book-grid">
            {visible.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h3>No books found.</h3>
            <p>Try another title, author, or category.</p>
            <button
              className="text-button"
              onClick={() => {
                updateFilters({ q: "", category: "All books" });
              }}
            >
              Clear filters
            </button>
          </div>
        )}

      </section>
    </>
  );
}
