import type { Metadata } from "next";
import { CrossVenueView } from "@/components/CrossVenueView";
import { fetchTopMarkets } from "@/lib/board";
import { findCrossVenue } from "@/lib/crossVenue";

export const revalidate = 300;
export const maxDuration = 60;
export const metadata: Metadata = { title: "Cross-Venue Prices · Crowdwise" };

export default async function CrossVenuePage() {
  const markets = await fetchTopMarkets();
  const pairs = findCrossVenue(markets);
  return <CrossVenueView pairs={pairs} />;
}
