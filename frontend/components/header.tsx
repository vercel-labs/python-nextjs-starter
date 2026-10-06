"use client";
import Link from "next/link";
import { Suspense } from "react";
import { usePathname } from "next/navigation";

import { useSession } from "./session";

export function Header() {
  const { user, loading } = useSession();
  return (
    <>
      <header className="header">
        <Link className="wordmark" href="/" aria-label="Margin bookstore home">
          <svg aria-hidden="true" width="20" height="18" viewBox="0 0 76 65"><path d="M37.5 0L75 65H0z" fill="currentColor" /></svg>
          <span className="brand-divider">/</span> Margin
          <small>Bookshop</small>
        </Link>
        <Suspense fallback={<nav aria-label="Main navigation"><Link href="/">Browse books</Link><Link href="/account">My bookshelf</Link></nav>}>
          <Navigation admin={!!user?.is_admin} />
        </Suspense>
        <Link className="account-link" href="/account">
          {loading
            ? "Your account"
            : user
              ? `Hello, ${user.name.split(" ")[0]}`
              : "Sign in"}{" "}
          <span aria-hidden="true">↗</span>
        </Link>
      </header>
    </>
  );
}

function Navigation({ admin }: { admin: boolean }) {
  const path = usePathname();
  return (
        <nav aria-label="Main navigation">
          <Link aria-current={path === "/" ? "page" : undefined} href="/">
            Browse books
          </Link>
          <Link
            aria-current={path === "/account" ? "page" : undefined}
            href="/account"
          >
            My bookshelf
          </Link>
          {admin ? <Link href="/admin">Manage shop</Link> : null}
        </nav>
  );
}
