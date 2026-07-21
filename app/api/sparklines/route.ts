import { NextResponse } from "next/server";
import { fetchTopMarkets, representativeByEvent } from "@/lib/board";
import { buildSparklines } from "@/lib/sparklines";
import { fetchKalshiMarketHistory } from "@/lib/sources";

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
      (s, t) => fetchKalshiMarketHistory(s, t, { days: 7, periodInterval: 60 }),
      { maxMarkets: 40 },
    );
    return NextResponse.json(data);
  } catch (err) {
    console.warn("sparklines compute failed", err);
    return NextResponse.json({ sparks: {}, moves: {} });
  }
}
