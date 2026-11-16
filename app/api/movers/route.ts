import { NextResponse } from "next/server";
import { getBuildBoard } from "@/lib/buildBoard";
import { computeTopMovers } from "@/lib/movers";
import { displayTitle } from "@/lib/highlights";
import { fetchKalshiMarketHistory, fetchPolymarketMarketHistory } from "@/lib/sources";

export const dynamic = "force-static";

export async function GET() {
  // Both venues are in play and the fetches are throttled inside computeTopMovers,
  // so a wider candidate pool costs wall-clock rather than 429s.
  try {
    const { markets } = await getBuildBoard();
    const movers = await computeTopMovers(
      markets,
      (m) => m.platform === "Polymarket"
        ? fetchPolymarketMarketHistory(m.clobTokenId ?? "", { days: 7, fidelity: 60 })
        : fetchKalshiMarketHistory(m.series, m.id, { days: 7, periodInterval: 60 }),
      { maxMarkets: 40, dedupeKey: displayTitle },
    );
    return NextResponse.json({ movers });
  } catch (err) {
    console.warn("movers compute failed", err);
    return NextResponse.json({ movers: [] });
  }
}
