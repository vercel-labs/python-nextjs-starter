"use client";

import Link from "next/link";

export default function BookError({ retry }: { retry: () => void }) {
  return (
    <main id="main" className="page-shell empty-state">
      <h1>The shop is temporarily unavailable.</h1>
      <p>We couldn’t load this book. Please try again.</p>
      <button className="primary-button" onClick={() => retry()}>Try again</button>
      <Link className="back-link" href="/">Back to the collection</Link>
    </main>
  );
}
