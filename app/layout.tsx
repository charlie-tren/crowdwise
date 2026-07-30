import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crowdwise",
  description: "The crowd's odds on macro events - live from Kalshi and Polymarket prediction markets.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-[var(--text)] antialiased">
        <header className="border-b border-white/[0.06]">
          <Nav />
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="border-t border-white/10">
          <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-[var(--muted-dim)]">
            Data: Kalshi &amp; Polymarket public APIs · refreshed ~5 min · For information only - not financial advice. See{" "}
            <Link href="/about" className="underline hover:text-[var(--text)]">About</Link>. · v0.4.0
          </div>
        </footer>
      </body>
    </html>
  );
}
