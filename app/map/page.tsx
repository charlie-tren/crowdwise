import { MarketMapView } from "@/components/MarketMapView";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";
import type { Market } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function MarketMapPage() {
  let markets: Market[] | undefined;
  try { markets = (await boardStore.readBoard())?.markets; } catch { /* fall through */ }
  if (!markets) markets = await fetchTopMarkets();
  return <MarketMapView markets={markets} />;
}
