import { Suspense } from "react";
import { headers } from "next/headers";
import Link from "next/link";
import { getBooks } from "@/lib/catalog";
import { Catalog } from "@/components/catalog";
import { CatalogHero } from "@/components/catalog-hero";
import { BookCover } from "@/components/book-cover";
import { CollectionSkeleton, FeaturedSkeleton } from "@/components/loading";
import { CatalogBoundary } from "@/components/catalog-boundaries";

export const instant = true;
export default function Home() {
  return (
    <main id="main">
      <CatalogBoundary>
        <CatalogHero><Suspense fallback={<FeaturedSkeleton />}><FeaturedBook /></Suspense></CatalogHero>
        <Suspense fallback={<CollectionSkeleton />}><Collection /></Suspense>
      </CatalogBoundary>
    </main>
  );
}

async function FeaturedBook() {
  // Defer service access until runtime, while allowing the prefetch request
  // to resolve cached content. connection() would block prefetching here.
  await headers();
  const books = await getBooks();
  const featured = books.find((book) => book.featured);
  return <>
    {featured ? <Link prefetch={true} href={`/books/${featured.id}`} className="hero-book-link" aria-label={`Read about ${featured.title}`}><BookCover book={featured} large /></Link> : <div className="book-placeholder">Your next<br />chapter.</div>}
    <div className="feature-caption"><span>The Margin pick</span><span>{featured ? "01" : "00"} / {String(books.length).padStart(2, "0")}</span></div>
  </>;
}

async function Collection() {
  // Unlike connection(), headers() also resolves during runtime prefetch.
  // No request headers or session data are passed into the public cache.
  await headers();
  const books = await getBooks();
  return <Catalog initialBooks={books} initialError={false} />;
}
