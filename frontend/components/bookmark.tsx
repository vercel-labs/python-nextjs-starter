import { getBookmarkSession } from "@/lib/bookmark";
import type { Book } from "@/lib/types";
import { BookmarkButton } from "./bookmark-button";
import { BookmarkBoundary } from "./bookmark-boundary";

export function BookmarkPending({ book }: { book: Book }) {
  // Reuse authenticated browser state on return navigation; the first visit
  // keeps the same reserved control while the server session streams in.
  return <BookmarkButton book={book} initial={null} />;
}

// Only this leaf waits for the session and private bookshelf query.
export function Bookmark({ book }: { book: Book }) {
  return <BookmarkBoundary book={book}><BookmarkStatus book={book} /></BookmarkBoundary>;
}

async function BookmarkStatus({ book }: { book: Book }) {
  const session = await getBookmarkSession();
  const initial = { userId: session?.userId ?? null, saved: session?.ids.includes(book.id) ?? false };
  return <BookmarkButton book={book} initial={initial} />;
}
