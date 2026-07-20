import type { Metadata } from "next";
import { MarketMapView } from "@/components/MarketMapView";
import { fetchTopMarkets } from "@/lib/board";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = { title: "Market Map · Crowdwise" };

export default async function MarketMapPage() {
  const markets = await fetchTopMarkets();
  return <MarketMapView markets={markets} />;
}
