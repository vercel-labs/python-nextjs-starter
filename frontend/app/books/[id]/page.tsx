import { Suspense } from "react";
import { headers } from "next/headers";
import { getBook } from "@/lib/catalog";
import { Bookmark, BookmarkPending } from "@/components/bookmark";
import { BookDetail } from "@/components/book-detail";
import { DetailSkeleton } from "@/components/loading";

export const instant = true;
type Props = { params: Promise<{ id: string }> };
export default function Detail({ params }: Props) {
  return <Suspense fallback={<DetailSkeleton />}><Details params={params} /></Suspense>;
}

async function Details({ params }: Props) {
  // Unlike connection(), headers() also resolves during runtime prefetch.
  // No request headers or session data are passed into the public cache.
  await headers();
  const { id } = await params;
  const book = await getBook(id);
  return <BookDetail initialBook={book}>{book ? <Suspense fallback={<BookmarkPending book={book} />}><Bookmark book={book} /></Suspense> : null}</BookDetail>;
}
