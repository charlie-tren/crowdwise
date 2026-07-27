import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { fetchTopMarkets, representativeByEvent } from "@/lib/board";
import { displayTitle } from "@/lib/highlights";

export const revalidate = 300;
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) return { title: "Market · Crowdwise" };
  return { title: `${displayTitle(m).slice(0, 60)} · Crowdwise` };
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) notFound();
  const related = representativeByEvent(markets)
    .filter((r) => r.category === m.category && r.id !== m.id)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, 6);
  return <MarketDetail m={m} related={related} />;
}
