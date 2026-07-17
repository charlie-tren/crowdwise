import { NextResponse } from "next/server";
import { fetchTopMarkets } from "@/lib/board";
import { findCrossVenue } from "@/lib/crossVenue";

export const revalidate = 300;
export const maxDuration = 60;

export async function GET() {
  const markets = await fetchTopMarkets();
  const pairs = findCrossVenue(markets);
  return NextResponse.json({
    count: pairs.length,
    pairs: pairs.map((p) => ({
      label: p.label,
      divergence: +(p.divergence * 100).toFixed(1),
      kalshi: +(p.kalshiProb * 100).toFixed(1),
      polymarket: +(p.polymarketProb * 100).toFixed(1),
      kalshiTitle: p.kalshi.title,
      polymarketTitle: p.polymarket.title,
    })),
  });
}
