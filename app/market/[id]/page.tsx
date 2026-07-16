import { notFound } from "next/navigation";
import { MarketDetail } from "@/components/MarketDetail";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";
import type { Market } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  let markets: Market[] | undefined;
  try {
    markets = (await boardStore.readBoard())?.markets;
  } catch { /* fall through */ }
  if (!markets) markets = await fetchTopMarkets();
  const m = markets.find((x) => x.id === id);
  if (!m) notFound();
  return <MarketDetail m={m} />;
}
