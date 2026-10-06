"use client";

import { track } from "@vercel/analytics";

export type BookmarkSource = "detail" | "bookshelf";

export function trackBookmark(action: "saved" | "removed", source: BookmarkSource) {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return;
  try {
    track(action === "saved" ? "Bookmark saved" : "Bookmark removed", { source });
  } catch {
    // Analytics must never interrupt a confirmed database operation.
  }
}
