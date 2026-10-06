import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { backend, BackendError } from "./backend";
import type { Book } from "./types";

// Public, cookie-free data only. Vercel supplies the remote cache handler;
// local Next.js uses its default handler. Failures propagate and aren't cached
// as an empty catalog. Only an authoritative 404 becomes a missing book.
export async function getBooks(): Promise<Book[]> {
  "use cache: remote";
  cacheTag("public-books");
  cacheLife({ stale: 300, revalidate: 60, expire: 3600 });
  return backend<Book[]>("/books");
}

export async function getBook(id: string): Promise<Book | null> {
  "use cache: remote";
  cacheTag("public-books");
  cacheLife({ stale: 300, revalidate: 60, expire: 3600 });
  try {
    return await backend<Book>(`/books/${encodeURIComponent(id)}`);
  } catch (error) {
    // Expected absence must cross the cache boundary as serializable data;
    // custom Error prototypes/status fields do not survive that boundary.
    if (error instanceof BackendError && error.status === 404) return null;
    throw error;
  }
}
