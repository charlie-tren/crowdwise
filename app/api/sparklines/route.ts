import { NextResponse } from "next/server";
import { representativeByEvent } from "@/lib/board";
import { getBuildBoard } from "@/lib/buildBoard";
import { buildSparklines } from "@/lib/sparklines";
import { fetchKalshiMarketHistory, fetchPolymarketMarketHistory } from "@/lib/sources";
import type { Market } from "@/lib/types";

// Dispatch a market to its ~30-day price-history source for the board trend
// sparkline. Kalshi: 30d of daily candles. Polymarket: interval=1m (last month
// of available history) rather than a 30d start/end window - a fixed window that
// predates a young market's first trade makes the CLOB return NOTHING, so an
// interval lookback (clamped to the market's age) is what fills newer markets.
function fetchHistoryTrend(m: Market) {
  return m.platform === "Polymarket"
    ? fetchPolymarketMarketHistory(m.clobTokenId ?? "", { interval: "1m", fidelity: 720 })
    : fetchKalshiMarketHistory(m.series, m.id, { days: 30, periodInterval: 1440 });
}

// 7-day card sparklines for the whole default board, fetched
// with a bounded concurrency pool (see buildSparklines) so covering every row
// doesn't hammer the Kalshi/Polymarket history APIs. maxMarkets sits above the
// representative board size (~130) so no visible row is left without a sparkline.
export const dynamic = "force-static";

export async function GET() {
  try {
    const { markets } = await getBuildBoard();
    // Fetch history for the SAME representatives the board shows by default
    // (representativeByEvent), so the returned ids match the rendered card ids.
    const data = await buildSparklines(
      representativeByEvent(markets),
      fetchHistoryTrend,
      { maxMarkets: 250 },
    );
    return NextResponse.json(data);
  } catch (err) {
    console.warn("sparklines compute failed", err);
    return NextResponse.json({ sparks: {}, moves: {} });
  }
}
