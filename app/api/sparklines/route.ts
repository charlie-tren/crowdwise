import { NextResponse } from "next/server";
import { fetchTopMarkets, representativeByEvent } from "@/lib/board";
import { buildSparklines } from "@/lib/sparklines";
import { fetchKalshiMarketHistory, fetchPolymarketMarketHistory } from "@/lib/sources";
import type { Market } from "@/lib/types";

// Dispatch a market to the right 7d price-history source: Kalshi candlesticks or
// Polymarket CLOB price history.
function fetchHistory7d(m: Market) {
  return m.platform === "Polymarket"
    ? fetchPolymarketMarketHistory(m.clobTokenId ?? "", { days: 7, fidelity: 60 })
    : fetchKalshiMarketHistory(m.series, m.id, { days: 7, periodInterval: 60 });
}

// 7-day card sparklines for the whole default board. Cached (10 min) and fetched
// with a bounded concurrency pool (see buildSparklines) so covering every row
// doesn't hammer the Kalshi/Polymarket history APIs. maxMarkets sits above the
// representative board size (~130) so no visible row is left without a sparkline.
export const revalidate = 600;
export const maxDuration = 60;

export async function GET() {
  try {
    const markets = await fetchTopMarkets();
    // Fetch history for the SAME representatives the board shows by default
    // (representativeByEvent), so the returned ids match the rendered card ids.
    const data = await buildSparklines(
      representativeByEvent(markets),
      fetchHistory7d,
      { maxMarkets: 250 },
    );
    return NextResponse.json(data);
  } catch (err) {
    console.warn("sparklines compute failed", err);
    return NextResponse.json({ sparks: {}, moves: {} });
  }
}
