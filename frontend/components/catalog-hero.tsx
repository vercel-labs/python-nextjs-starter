import Link from "next/link";
import type { ReactNode } from "react";
export function CatalogHero({ children }: { children: ReactNode }) {
  return <>
      <section className="hero">
        <div className="hero-copy">
          <h1>
            Good books.
            <br />
            Room to <em>wander.</em>
          </h1>
          <p className="hero-description">
            Step off the beaten shelf. Discover thoughtful stories,
            <br className="desktop-break" /> fresh perspectives, and books worth
            keeping close.
          </p>
          <a className="primary-button" href="#collection">
            Explore the collection <span aria-hidden="true">↓</span>
          </a>
          <Link className="outline-button hero-shelf" href="/account">My bookshelf</Link>
        </div>
        <div className="hero-feature">
          {children}
        </div>
      </section>

  </>;
}
