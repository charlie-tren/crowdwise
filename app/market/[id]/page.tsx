import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { fetchTopMarkets, representativeByEvent } from "@/lib/board";
import { fetchMarketById } from "@/lib/sources";
import { displayTitle } from "@/lib/highlights";
import type { Market } from "@/lib/types";

// Resolve one market for this route. The volume-ranked top-set shifts slightly
// between requests, so a link that was valid when generated can be missing from a
// later fetch - fall back to a deterministic by-id lookup rather than 404ing a
// real market (which also made the page serve the generic OG card).
async function findMarket(id: string, markets: Market[]): Promise<Market | null> {
  return markets.find((x) => x.id === id) ?? (await fetchMarketById(id));
}

export const revalidate = 300;
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = await findMarket(id, markets);
  if (!m) return { title: "Market · Crowdwise" };
  // Each market page carried the site-wide description before this, so ~130 pages
  // described themselves identically. State this market's own subject instead:
  // the question, where it trades and when it settles. No probability in the
  // description - the number moves every few minutes and a snippet Google cached
  // last week would be quoting a stale price as if it were current.
  const settles = m.endDate ? `, settling ${m.endDate}` : "";
  return {
    title: `${displayTitle(m).slice(0, 60)} · Crowdwise`,
    description: `${displayTitle(m)} - live implied probability from ${m.platform}${settles}.`,
    alternates: { canonical: `/market/${encodeURIComponent(m.id)}` },
  };
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = await findMarket(id, markets);
  if (!m) notFound();
  const related = representativeByEvent(markets)
    .filter((r) => r.category === m.category && r.id !== m.id)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 6);
  return <MarketDetail m={m} related={related} />;
}
