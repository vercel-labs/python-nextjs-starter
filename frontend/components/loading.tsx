import Link from "next/link";

export function FeaturedSkeleton() {
  return <div className="book-cover large skeleton" aria-label="Loading featured book" />;
}

export function CollectionSkeleton() {
  return (
    <section id="collection" className="collection" aria-busy="true">
      <div className="collection-title"><h2>Find your next chapter.</h2><div className="search skeleton" aria-hidden="true" /></div>
      <div className="collection-filters"><div className="category-tabs skeleton loading-filters" aria-hidden="true" /><p role="status" className="muted">Opening the collection…</p></div>
      <div className="book-grid" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="book-cover skeleton" />)}
      </div>
    </section>
  );
}

export function DetailSkeleton() {
  return (
    <main id="main" className="page-shell" aria-busy="true">
      <Link className="back-link" href="/">← Back to the collection</Link>
      <div className="detail-layout">
        <div className="detail-cover"><div className="book-cover large skeleton" /></div>
        <div className="detail-copy"><p className="eyebrow">Margin editions</p><h1>Opening your next chapter.</h1><p role="status" className="muted loading-caption">Loading book details…</p></div>
      </div>
    </main>
  );
}
