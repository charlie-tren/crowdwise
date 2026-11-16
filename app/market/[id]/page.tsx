import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { MarketFallback } from "@/components/MarketFallback";
import { relatedMarkets } from "@/lib/board";
import { findBuiltMarket, getBuildBoard, marketParams } from "@/lib/buildBoard";
import { FALLBACK_ID } from "@/lib/marketFallback";
import { displayTitle } from "@/lib/highlights";

export const generateStaticParams = marketParams;
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  if (id === FALLBACK_ID) return { title: "Market - Crowdwise", robots: { index: false } };
  const m = await findBuiltMarket(id);
  if (!m) return { title: "Market - Crowdwise" };
  // Each market page carried the site-wide description before this, so ~130 pages
  // described themselves identically. State this market's own subject instead:
  // the question, where it trades and when it settles. No probability in the
  // description - the number moves every few minutes and a snippet Google cached
  // last week would be quoting a stale price as if it were current.
  const settles = m.endDate ? `, settling ${m.endDate}` : "";
  return {
    title: `${displayTitle(m).slice(0, 60)} - Crowdwise`,
    description: `${displayTitle(m)} - live implied probability from ${m.platform}${settles}.`,
    alternates: { canonical: `/market/${encodeURIComponent(m.id)}` },
  };
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  if (id === FALLBACK_ID) return <MarketFallback />;
  const m = await findBuiltMarket(id);
  if (!m) notFound();
  const { markets } = await getBuildBoard();
  return <MarketDetail m={m} related={relatedMarkets(markets, m)} />;
}
