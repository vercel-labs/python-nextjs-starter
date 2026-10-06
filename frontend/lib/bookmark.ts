import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { randomUUID } from "node:crypto";
import { fetchBackend } from "./observability";
import type { Book, User } from "./types";

// Request-scoped deduplication only: authenticated responses never enter the
// public catalog cache, and session tokens never become persistent cache keys.
export const getBookmarkSession = cache(async () => {
  const secure = ["production", "preview"].includes(process.env.VERCEL_ENV ?? "") || process.env.COOKIE_SECURE === "true";
  const cookieName = secure ? "__Host-margin_session" : "margin_session";
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  // Runtime prefetch can supply cookies while still validating a prerender.
  // Explicitly defer tracing randomness without blocking session prefetch.
  await io();
  const requestId = randomUUID();
  const read = (path: string) => fetchBackend(path, {
    headers: { Cookie: `${cookieName}=${token}` },
    cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(15000),
  }, requestId);
  const [userResponse, shelfResponse] = await Promise.all([read("/auth/me"), read("/shelf")]);
  if (userResponse.status === 401 || shelfResponse.status === 401) return null;
  if (!userResponse.ok || !shelfResponse.ok) throw new Error("Could not load bookmark status.");
  const [user, books] = await Promise.all([userResponse.json() as Promise<User>, shelfResponse.json() as Promise<Book[]>]);
  return { userId: user.id, ids: books.map((book) => book.id) };
});
