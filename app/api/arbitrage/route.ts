import { NextResponse } from "next/server";
import { fetchTopMarkets } from "@/lib/board";
import { findDiscrepancies } from "@/lib/arbitrage";

export const revalidate = 300;
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const minSpread = Number(url.searchParams.get("minSpread") ?? 0.05);
  const minScore = Number(url.searchParams.get("minScore") ?? 0.55);
  const markets = await fetchTopMarkets();
  const found = findDiscrepancies(markets, { minSpread, minScore });
  return NextResponse.json({
    count: found.length,
    discrepancies: found.slice(0, 40).map((d) => ({
      category: d.kalshi.category,
      spread: +(d.spread * 100).toFixed(1),
      score: +d.score.toFixed(2),
      kalshi: { title: d.kalshi.title, prob: d.kalshi.prob, endDate: d.kalshi.endDate, id: d.kalshi.id },
      polymarket: { title: d.polymarket.title, prob: d.polymarket.prob, endDate: d.polymarket.endDate, id: d.polymarket.id },
    })),
  });
}
