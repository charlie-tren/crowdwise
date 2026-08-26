import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crowdwise",
  description: "Live odds on macro events - Fed decisions, inflation, recessions - from Kalshi and Polymarket.",
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
        {/* Cloudflare Web Analytics. Feeds the private stats dashboard, which runs
            one account-wide query and splits by `requestHost`, so this is
            deliberately the same token as every other site in the estate.
            Cookieless. `afterInteractive` keeps it off the hydration path. */}
        <Script
          src="https://static.cloudflareinsights.com/beacon.min.js"
          strategy="afterInteractive"
          data-cf-beacon='{"token": "32b821209b5441a08df42ccf61c9e6c2"}'
        />
        {/* Returning people, which Web Analytics cannot answer: it is cookieless
            and carries no visitor identifier. This reads a date stamp from the
            visitor's own localStorage and reports two words once per session,
            new or returning plus an age bucket. See site-stats/beacon. */}
        <Script
          src="https://beacon.charlietrenorden.com/b.js"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
