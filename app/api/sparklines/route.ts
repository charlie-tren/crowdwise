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

// 7-day card sparklines for the top Kalshi markets by volume. Bounded + cached
// (10 min) so public traffic doesn't hammer Kalshi's candlestick API.
export const revalidate = 600;

export async function GET() {
  try {
    const markets = await fetchTopMarkets();
    // Fetch history for the SAME representatives the board shows by default
    // (representativeByEvent), so the returned ids match the rendered card ids.
    const data = await buildSparklines(
      representativeByEvent(markets),
      fetchHistory7d,
      { maxMarkets: 40 },
    );
    return NextResponse.json(data);
  } catch (err) {
    console.warn("sparklines compute failed", err);
    return NextResponse.json({ sparks: {}, moves: {} });
  }
}
