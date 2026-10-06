"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useSession } from "./session";
import { useBookshelf } from "./bookshelf";
import { BookCard } from "./book-card";
import { announceChange } from "@/lib/state-events";

export function Account() {
  const { user, loading, refresh } = useSession();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { books: shelf, loading: shelfLoading, error: shelfError, retry, remove: removeBook } = useBookshelf();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form)),
      });
      formElement.reset();
      announceChange("session");
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      announceChange("session");
      await refresh();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await removeBook(id, "bookshelf");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main id="main" className="page-shell">
        <p role="status">Opening your bookshelf…</p>
      </main>
    );
  if (user)
    return (
      <main id="main" className="page-shell">
        <div className="page-heading">
          <div>
            <p className="eyebrow">Your bookshelf</p>
            <h1>{user.name}’s bookshelf.</h1>
            <p className="muted">Keep the books you want to come back to.</p>
          </div>
          <button className="outline-button" disabled={busy} onClick={logout}>
            Sign out ↗
          </button>
        </div>
        {user.is_admin ? (
          <div className="admin-banner">
            You’re a shop administrator.{" "}
            <Link href="/admin">Manage the catalog →</Link>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {shelfError ? (
          <div><p role="alert" className="error">{shelfError}</p><button className="outline-button" onClick={retry}>Retry loading saved books</button></div>
        ) : shelfLoading ? (
          <p>Loading saved books…</p>
        ) : shelf.length ? (
          <div className="book-grid">
            {shelf.map((book) => (
              <div key={book.id}>
                <BookCard book={book} />
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => remove(book.id)}
                >
                  Remove from bookshelf
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>A little space for your next favorites.</h2>
            <p>Save a book from its detail page to start your collection.</p>
            <Link className="primary-button" href="/">
              Browse books ↗
            </Link>
          </div>
        )}
      </main>
    );
  return (
    <main id="main" className="page-shell auth-layout">
      <div className="auth-intro">
        <p className="eyebrow">Make yourself at home</p>
        <h1>
          A shelf
          <br />
          of your <em>own.</em>
        </h1>
        <p>
          Save the stories that catch your eye.
          <br />
          They’ll be here when you’re ready.
        </p>
        <div className="auth-ornament" aria-hidden="true">
          ✳
        </div>
      </div>
      <section className="auth-panel">
        <div className="auth-tabs">
          <button
            aria-pressed={mode === "login"}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            Sign in
          </button>
          <button
            aria-pressed={mode === "register"}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            Create account
          </button>
        </div>
        <h1>
          {mode === "login" ? "Welcome back." : "Let’s start a new chapter."}
        </h1>
        <form onSubmit={submit}>
          {mode === "register" ? (
            <label>
              Your name
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          ) : null}
          <label>
            Email address
            <input
              name="email"
              type="email"
              spellCheck={false}
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={mode === "login" ? 1 : 15}
              maxLength={128}
            />
          </label>
          {mode !== "login" && (
            <p className="field-help">Use at least 15 characters.</p>
          )}
          {error ? (
            <p className="error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button full-width" disabled={busy} aria-busy={busy}>
            {busy
              ? "One moment…"
              : mode === "login"
                ? "Sign in →"
                : "Create my account →"}
          </button>
        </form>
        <p className="muted">
          Demo accounts are stored in the bookstore database. Please use a
          unique password.
        </p>
      </section>
    </main>
  );
}
