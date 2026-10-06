"use client";

import { catchError } from "next/error";
import type { Book } from "@/lib/types";
import { BookmarkButton } from "./bookmark-button";

// Browser account state remains usable when the optional server snapshot fails.
export const BookmarkBoundary = catchError(function BookmarkFallback({ book }: { book: Book }) {
  return <BookmarkButton book={book} initial={null} />;
});
