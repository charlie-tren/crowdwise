import { MarketMapView } from "@/components/MarketMapView";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;

export default async function MarketMapPage() {
  const markets = await fetchTopMarkets();
  return <MarketMapView markets={markets} />;
}
