import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="page-shell empty-state">
      <p className="eyebrow">PAGE NOT FOUND</p>
      <h1>A chapter is missing.</h1>
      <p>This page has moved, or the address isn’t quite right.</p>
      <Link className="primary-button" href="/">
        Back to the collection ↗
      </Link>
    </main>
  );
}
