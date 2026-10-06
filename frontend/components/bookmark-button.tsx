"use client";
import Link from "next/link";
import type { Book } from "@/lib/types";
import { useBookshelf } from "./bookshelf";
import { useSession } from "./session";

export function BookmarkButton({ book, initial }: {
  book: Book;
  initial: { userId: string | null; saved: boolean } | null;
}) {
  const { user, loading: sessionLoading } = useSession();
  const { books, pendingActions, saveMessages, loading: shelfLoading, error, retry, save, remove } = useBookshelf();
  const pendingAction = pendingActions[book.id];
  const busy = !!pendingAction;
  const message = saveMessages[book.id] ?? "";
  const initialMatches = initial?.userId === user?.id;
  const saved = sessionLoading ? !!initial?.saved : !!user && (
    shelfLoading ? initialMatches && !!initial?.saved : books.some((item) => item.id === book.id)
  );
  const signedIn = sessionLoading ? !!initial?.userId : !!user;
  async function toggleBookmark() {
    try { if (saved) await remove(book.id, "detail"); else await save(book, "detail"); } catch { /* The shared feedback area displays the error. */ }
  }
  return <div className="bookmark-control">
    {signedIn ? <button className="primary-button bookmark-action" disabled={busy || sessionLoading || shelfLoading || !!error} aria-busy={busy || sessionLoading || shelfLoading} aria-pressed={saved} onClick={toggleBookmark}>
      {busy ? pendingAction === "remove" ? "Removing…" : "Saving…" : saved ? "Remove from my bookshelf −" : "Save to my bookshelf +"}
    </button> : sessionLoading && initial === null ? <button className="primary-button bookmark-action" disabled aria-busy="true">Save to my bookshelf +</button> : <Link className="primary-button bookmark-action" href="/account">Sign in to save this book ↗</Link>}
    {user && error ? <div><p role="alert" className="error">{error}</p><button className="text-button" onClick={retry}>Retry bookmark status</button></div> : null}
    <p role="status" className="bookmark-feedback">{message}</p>
  </div>;
}
