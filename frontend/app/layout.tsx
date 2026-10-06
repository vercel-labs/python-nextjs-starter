import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
import Link from "next/link";
import { SessionProvider } from "@/components/session";
import { Header } from "@/components/header";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Margin — An independent bookshop",
    template: "%s · Margin",
  },
  description:
    "Books for curious minds. Explore the Margin collection and build your personal bookshelf.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geist.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SessionProvider>
          <Header />
          {children}
        </SessionProvider>
        <footer className="footer">
          <div>
            <Link className="footer-logo" href="/">
              ▲ Margin
            </Link>
            <p>For the stories that stay with you.</p>
          </div>
          <div>
            <p>Take your time. Find your next favorite.</p>
            <small>A demo bookshop · Fictional titles · No checkout</small>
          </div>
        </footer>
        {process.env.NEXT_PUBLIC_VERCEL_ENV === "production" ? <Analytics /> : null}
      </body>
    </html>
  );
}
