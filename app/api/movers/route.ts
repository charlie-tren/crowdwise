import { NextResponse } from "next/server";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";
import { computeTopMovers } from "@/lib/movers";
import { fetchKalshiMarketHistory } from "@/lib/sources";

export const revalidate = 600;

export async function GET() {
  try {
    const cached = await boardStore.readMovers();
    if (cached && cached.length) return NextResponse.json({ movers: cached });
  } catch (err) {
    console.warn("movers KV read failed", err);
  }
  // Fallback: compute on demand from the current board (bounded to 20 markets).
  try {
    let markets;
    try { markets = (await boardStore.readBoard())?.markets; } catch { /* ignore */ }
    if (!markets) markets = await fetchTopMarkets();
    const movers = await computeTopMovers(markets, (s, t) => fetchKalshiMarketHistory(s, t, { days: 7, periodInterval: 60 }), { maxMarkets: 20 });
    return NextResponse.json({ movers });
  } catch (err) {
    console.warn("movers compute failed", err);
    return NextResponse.json({ movers: [] });
  }
}
