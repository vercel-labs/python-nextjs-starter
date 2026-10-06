"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { trackBookmark, type BookmarkSource } from "@/lib/analytics";
import { announceChange, subscribeToChanges } from "@/lib/state-events";
import type { Book } from "@/lib/types";

type ShelfState = {
  userId: string | null;
  books: Book[];
  ready: boolean;
  error: string;
};
type BookshelfContextValue = {
  books: Book[];
  pendingActions: Readonly<Record<string, "save" | "remove" | undefined>>;
  saveMessages: Readonly<Record<string, string>>;
  loading: boolean;
  error: string;
  retry: () => void;
  refresh: () => void;
  save: (book: Book, source: BookmarkSource) => Promise<void>;
  remove: (id: string, source: BookmarkSource) => Promise<void>;
};
const BookshelfContext = createContext<BookshelfContextValue | null>(null);

export function BookshelfProvider({ userId, children }: {
  userId: string | null;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ShelfState>({
    userId: null, books: [], ready: false, error: "",
  });
  const [attempt, setAttempt] = useState(0);
  const [pendingActions, setPendingActions] = useState<Record<string, "save" | "remove" | undefined>>({});
  const [saveMessages, setSaveMessages] = useState<Record<string, string>>({});
  const mutationVersion = useRef(0);
  useEffect(() => subscribeToChanges(["bookshelf", "catalog", "session"], () => {
    setSaveMessages({});
    setAttempt((value) => value + 1);
  }), []);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const version = mutationVersion.current;
    api<Book[]>("/shelf").then((books) => {
      if (active && version === mutationVersion.current) setState({ userId, books, ready: true, error: "" });
    }).catch((error: Error) => {
      if (active && version === mutationVersion.current) setState({ userId, books: [], ready: false, error: error.message });
    });
    return () => { active = false; };
  }, [userId, attempt]);

  // Never expose a previous account's shelf, including while the next loads.
  const current = state.userId === userId ? state : null;
  async function save(book: Book, source: BookmarkSource) {
    if (!userId) throw new Error("Sign in to save this book.");
    mutationVersion.current += 1;
    setPendingActions((actions) => ({ ...actions, [book.id]: "save" }));
    setSaveMessages((messages) => ({ ...messages, [book.id]: "" }));
    try {
      await api(`/shelf/${book.id}`, { method: "PUT" });
      trackBookmark("saved", source);
      announceChange("bookshelf");
      setState((previous) => previous.userId === userId ? {
        ...previous,
        books: previous.books.some((item) => item.id === book.id)
          ? previous.books : [...previous.books, book].sort((a, b) => a.title.localeCompare(b.title)),
      } : previous);
      setSaveMessages((messages) => ({ ...messages, [book.id]: "Added to your bookshelf." }));
    } catch (error) {
      setSaveMessages((messages) => ({ ...messages, [book.id]: (error as Error).message }));
      throw error;
    } finally {
      // Fetch canonical book metadata after the write; older reads cannot win.
      mutationVersion.current += 1;
      setAttempt((value) => value + 1);
      setPendingActions((actions) => ({ ...actions, [book.id]: undefined }));
    }
  }

  async function remove(id: string, source: BookmarkSource) {
    if (!userId) throw new Error("Sign in to remove this book.");
    mutationVersion.current += 1;
    setPendingActions((actions) => ({ ...actions, [id]: "remove" }));
    setSaveMessages((messages) => ({ ...messages, [id]: "" }));
    try {
      await api(`/shelf/${id}`, { method: "DELETE" });
      trackBookmark("removed", source);
      announceChange("bookshelf");
      setState((previous) => previous.userId === userId ? {
        ...previous, books: previous.books.filter((book) => book.id !== id),
      } : previous);
      setSaveMessages((messages) => ({ ...messages, [id]: "Removed from your bookshelf." }));
    } catch (error) {
      setSaveMessages((messages) => ({ ...messages, [id]: (error as Error).message }));
      throw error;
    } finally {
      mutationVersion.current += 1;
      setAttempt((value) => value + 1);
      setPendingActions((actions) => ({ ...actions, [id]: undefined }));
    }
  }
  return <BookshelfContext.Provider value={{
    books: userId ? current?.books ?? [] : [],
    pendingActions,
    saveMessages,
    loading: !!userId && !current?.ready && !current?.error,
    error: userId ? current?.error ?? "" : "",
    retry: () => setAttempt((value) => value + 1),
    refresh: () => setAttempt((value) => value + 1),
    save,
    remove,
  }}>{children}</BookshelfContext.Provider>;
}

export function useBookshelf() {
  const value = useContext(BookshelfContext);
  if (!value) throw new Error("useBookshelf requires BookshelfProvider.");
  return value;
}
