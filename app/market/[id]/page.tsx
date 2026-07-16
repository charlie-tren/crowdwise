import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  const markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) notFound();
  return <MarketDetail m={m} />;
}
