"use client";

import { catchError, type ErrorInfo } from "next/error";
import { Catalog } from "./catalog";
import { CatalogHero } from "./catalog-hero";

// Both sections read the same catalog; one retry must recover both fallbacks.
export const CatalogBoundary = catchError(function CatalogFallback(
  _props: object,
  { retry }: ErrorInfo,
) {
  return <>
    <CatalogHero>
      <div className="book-placeholder">Your next<br />chapter.</div>
      <div className="feature-caption"><span>The Margin pick</span><span>00 / 00</span></div>
    </CatalogHero>
    <Catalog initialBooks={[]} initialError={true} onRetry={retry} />
  </>;
});
