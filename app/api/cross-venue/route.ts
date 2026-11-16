import { NextResponse } from "next/server";
import { getBuildBoard } from "@/lib/buildBoard";
import { findCrossVenue } from "@/lib/crossVenue";

export const dynamic = "force-static";

export async function GET() {
  const { markets } = await getBuildBoard();
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
