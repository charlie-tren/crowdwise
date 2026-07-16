import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Macro Signals",
  description: "Live prediction-market probabilities across macro themes (Kalshi + Polymarket).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-[var(--text)] antialiased">
        <header className="border-b border-white/10">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold text-[var(--text)]">Macro Signals</Link>
            <Link href="/timeline" className="text-muted hover:text-[var(--text)]">Timeline</Link>
            <Link href="/scenario" className="text-muted hover:text-[var(--text)]">Scenario</Link>
            <Link href="/about" className="ml-auto text-muted hover:text-[var(--text)]">About</Link>
          </nav>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
