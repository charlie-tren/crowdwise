import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Nav } from "@/components/Nav";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute base for canonicals and for the OG/Twitter image URLs, which were
  // resolving relative before this.
  metadataBase: new URL(SITE_URL),
  title: "Crowdwise",
  // PAIRED with the visible lede on app/page.tsx - keep the two identical, word
  // for word. Google ignores the description tag as often as not and builds its
  // own snippet from the h1 plus visible text, so the wanted sentence has to be
  // in both places or the snippet is whatever it picks. Same rule on every page
  // below: each description is its page's lede verbatim. EXCEPT the home page,
  // which overrides its description tag for search and AI engines in
  // app/page.tsx (07/10/2026) and keeps this lede for og and twitter.
  description: "Live odds on macro events - Fed decisions, inflation, recessions - from Kalshi and Polymarket.",
  alternates: { canonical: "/" },
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
            Data: Kalshi &amp; Polymarket public APIs · refreshed ~15 min · For information only - not financial advice. See{" "}
            <Link href="/about" className="underline hover:text-[var(--text)]">About</Link>. · v0.4.0
          </div>
        </footer>
        {/* Analytics, gated, one inline script instead of two src ones. Feeds the
            private stats dashboard, which runs one account-wide query and splits by
            `requestHost`, so the token is deliberately the same as every other site
            in the estate. Cookieless, and `afterInteractive` keeps it off the
            hydration path exactly as the two tags it replaces did.

            The gate: two kinds of visitor are not an audience and never load either
            beacon. Anyone who has opted out with ?nostats=1, which sets a flag in
            their own browser that ?nostats=0 undoes. And automation, since
            `navigator.webdriver` is the one signal true for Playwright, Puppeteer
            and Selenium alike - this estate drives a headless browser at all twenty
            sites for thumbnails, head checks and mobile audits, and Cloudflare
            bot-flags only some of them. This file is a server component so it cannot
            ask about navigator itself; the gate is a string that runs on the client.
            See site-stats/beacon and its tests/test_gate.py. */}
        <Script id="analytics-gate" strategy="afterInteractive">{`
          (function(){try{var X="ct.nostats",C="ct_nostats",
          D=";path=/;domain=.charlietrenorden.com",q=location.search,out=false;
          if(q.indexOf("nostats=1")>-1){try{localStorage.setItem(X,"1")}catch(e){}
          document.cookie=C+"=1"+D+";max-age=63072000;samesite=lax";}
          if(q.indexOf("nostats=0")>-1){try{localStorage.removeItem(X)}catch(e){}
          document.cookie=C+"="+D+";max-age=0";}
          try{out=!!localStorage.getItem(X)}catch(e){}
          if(!out)out=document.cookie.indexOf(C+"=1")>-1;
          if(out||navigator.webdriver)return;
          var d=document,s;
          s=d.createElement("script");s.defer=true;
          s.src="https://static.cloudflareinsights.com/beacon.min.js";
          s.setAttribute("data-cf-beacon",'{"token": "32b821209b5441a08df42ccf61c9e6c2"}');
          d.head.appendChild(s);
          s=d.createElement("script");s.defer=true;
          s.src="https://beacon.charlietrenorden.com/b.js";
          d.head.appendChild(s);
          }catch(e){}})();
        `}</Script>
      </body>
    </html>
  );
}
