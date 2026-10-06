"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { categories, price } from "@/lib/types";
import type { Book } from "@/lib/types";
import { useBookshelf } from "./bookshelf";
import { useSession } from "./session";
import { announceChange, subscribeToChanges } from "@/lib/state-events";

export function Admin() {
  const router = useRouter();
  const { refresh: refreshShelf } = useBookshelf();
  const { user, loading } = useSession();
  const [books, setBooks] = useState<Book[]>([]);
  const [editing, setEditing] = useState<Book | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const readVersion = useRef(0);
  useEffect(() => {
    if (!formOpen) return;
    editorHeading.current?.focus({ preventScroll: true });
    editorHeading.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [formOpen, editing]);
  useEffect(() => {
    if (pendingDelete) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [pendingDelete]);
  function openEditor(book: Book | null, trigger: HTMLButtonElement) {
    editorTrigger.current = trigger;
    setEditing(book);
    setFormOpen(true);
    setError("");
    setMessage("");
  }
  function closeEditor() {
    setFormOpen(false);
    requestAnimationFrame(() => {
      editorTrigger.current?.focus({ preventScroll: true });
      editorTrigger.current?.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      });
    });
  }
  async function load() {
    const version = ++readVersion.current;
    const next = await api<Book[]>("/books");
    if (version === readVersion.current) setBooks(next);
  }
  useEffect(() => {
    if (!user?.is_admin) return;
    const read = () => {
      const version = ++readVersion.current;
      api<Book[]>("/books").then((books) => {
        if (version === readVersion.current) setBooks(books);
      }).catch((error: Error) => {
        if (version === readVersion.current) setError(error.message);
      });
    };
    read();
    const unsubscribe = subscribeToChanges(["catalog"], read);
    return () => { readVersion.current += 1; unsubscribe(); };
  }, [user?.id, user?.is_admin]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const body = {
      title: data.get("title"),
      author: data.get("author"),
      description: data.get("description"),
      category: data.get("category"),
      cover_color: data.get("cover_color"),
      price_cents: Math.round(Number(data.get("price")) * 100),
      stock: Number(data.get("stock")),
      published_year: Number(data.get("published_year")),
      featured: data.get("featured") === "on",
    };
    try {
      await api(editing ? `/books/${editing.id}` : "/books", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      refreshShelf();
      router.refresh();
      announceChange("catalog");
      await load();
      closeEditor();
      setEditing(null);
      setMessage(editing ? "Book updated." : "Book added to the collection.");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/books/${id}`, { method: "DELETE" });
      refreshShelf();
      router.refresh();
      announceChange("catalog");
      await load();
      setMessage("Book deleted.");
      setPendingDelete(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="page-shell">
        <p>Checking your account…</p>
      </main>
    );
  if (!user?.is_admin)
    return (
      <main id="main" className="page-shell empty-state">
        <p className="eyebrow">Shop management</p>
        <h1>For the booksellers.</h1>
        <p>
          {user
            ? "Your account does not have administrator access."
            : "Sign in with an administrator account to manage the catalog."}
        </p>
        <Link className="primary-button" href="/account">
          Your account ↗
        </Link>
      </main>
    );
  return (
    <main id="main" className="page-shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Shop management</p>
          <h1>Manage the collection.</h1>
          <p className="muted">Add, edit, and make room for new stories.</p>
        </div>
        <button
          className="primary-button"
          onClick={(event) => openEditor(null, event.currentTarget)}
        >
          Add a book +
        </button>
      </div>
      {error && !pendingDelete ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <p className="status-message admin-status" role="status">
        {message}
      </p>
      {formOpen ? (
        <section className="editor-panel">
          <h2 ref={editorHeading} tabIndex={-1}>
            {editing ? "Edit book" : "A new addition."}
          </h2>
          <form autoComplete="off" key={editing?.id ?? "new"} onSubmit={submit}>
            <div className="form-grid">
              <label>
                Title
                <input
                  name="title"
                  required
                  maxLength={160}
                  defaultValue={editing?.title}
                />
              </label>
              <label>
                Author
                <input
                  name="author"
                  required
                  maxLength={120}
                  defaultValue={editing?.author}
                />
              </label>
              <label>
                Category
                <select
                  name="category"
                  defaultValue={editing?.category ?? "Fiction"}
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label>
                Price (USD)
                <input
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  max="10000"
                  required
                  defaultValue={editing ? editing.price_cents / 100 : 20}
                />
              </label>
              <label>
                Copies in stock
                <input
                  name="stock"
                  type="number"
                  step="1"
                  min="0"
                  max="100000"
                  required
                  defaultValue={editing?.stock ?? 10}
                />
              </label>
              <label>
                Publication year
                <input
                  name="published_year"
                  type="number"
                  step="1"
                  min="1400"
                  max="2100"
                  required
                  defaultValue={
                    editing?.published_year ?? new Date().getFullYear()
                  }
                />
              </label>
              <label>
                Cover color
                <input
                  name="cover_color"
                  type="color"
                  defaultValue={editing?.cover_color ?? "#245947"}
                />
              </label>
              <label className="checkbox-label">
                <input
                  name="featured"
                  type="checkbox"
                  defaultChecked={editing?.featured}
                />{" "}
                Featured book
              </label>
            </div>
            <label>
              Description
              <textarea
                name="description"
                required
                maxLength={3000}
                rows={4}
                defaultValue={editing?.description}
              />
            </label>
            <div className="button-row">
              <button className="primary-button" disabled={busy} aria-busy={busy}>
                {busy ? "Saving…" : "Save book →"}
              </button>
              <button
                className="outline-button"
                type="button"
                disabled={busy}
                onClick={closeEditor}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}
      <div className="table-wrap">
        <table className="admin-table">
          <caption className="sr-only">Book catalog management</caption>
          <thead>
            <tr>
              <th scope="col">Book / author</th>
              <th scope="col">Category</th>
              <th scope="col" className="numeric">Price</th>
              <th scope="col" className="numeric">Stock</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {books.map((book) => (
              <tr key={book.id}>
                <td>
                  <strong>{book.title}</strong>
                  <small>{book.author}</small>
                </td>
                <td data-label="Category">{book.category}</td>
                <td data-label="Price" className="numeric">{price(book.price_cents)}</td>
                <td data-label="Stock" className="numeric">{book.stock}</td>
                <td>
                  <div className="button-row">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={(event) => openEditor(book, event.currentTarget)}
                    >
                      Edit<span className="sr-only"> {book.title}</span>
                    </button>
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setPendingDelete(book.id);
                      }}
                    >
                      Delete<span className="sr-only"> {book.title}</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dialog
        ref={deleteDialog}
        className="delete-dialog"
        aria-labelledby="delete-title"
        aria-describedby="delete-description"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setPendingDelete(null);
        }}
      >
        <p className="eyebrow">Catalog management</p>
        <h2 id="delete-title">Delete this book?</h2>
        <p id="delete-description">
          “{books.find((book) => book.id === pendingDelete)?.title}” will be
          removed from the catalog and saved bookshelves.
        </p>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="button-row">
          <button
            className="outline-button"
            autoFocus
            disabled={busy}
            onClick={() => setPendingDelete(null)}
          >
            Keep book
          </button>
          <button
            className="primary-button destructive-button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => pendingDelete && remove(pendingDelete)}
          >
            {busy ? "Deleting…" : "Delete book"}
          </button>
        </div>
      </dialog>
    </main>
  );
}
