import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) return { title: "Market · Macro Signals" };
  return { title: `${m.title.slice(0, 60)} · Macro Signals` };
}

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) notFound();
  return <MarketDetail m={m} />;
}
