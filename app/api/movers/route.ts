import { NextResponse } from "next/server";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";
import { computeTopMovers } from "@/lib/movers";
import { displayTitle } from "@/lib/highlights";
import { fetchKalshiMarketHistory, fetchPolymarketMarketHistory } from "@/lib/sources";

export const revalidate = 1800;
// A regeneration fetches price history for up to 40 markets. Measured at ~6-7s
// locally with Polymarket unreachable, so longer from a US region where it is:
// past the 10s default this route would be killed mid-flight and the chart would
// come back empty. Matches /api/sparklines, which does the same kind of work.
// The 600s ISR window means visitors are served the stale copy meanwhile.
export const maxDuration = 60;

export async function GET() {
  try {
    const cached = await boardStore.readMovers();
    if (cached && cached.length) return NextResponse.json({ movers: cached });
  } catch (err) {
    console.warn("movers KV read failed", err);
  }
  // Fallback: compute on demand from the current board. Both venues are in play
  // and the fetches are throttled inside computeTopMovers, so a wider candidate
  // pool costs wall-clock rather than 429s.
  try {
    let markets;
    try { markets = (await boardStore.readBoard())?.markets; } catch { /* ignore */ }
    if (!markets) markets = await fetchTopMarkets();
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
