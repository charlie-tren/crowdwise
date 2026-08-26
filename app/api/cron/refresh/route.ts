import { NextResponse } from "next/server";
import { fetchTopMarkets } from "@/lib/board";
import { boardStore } from "@/lib/kvClient";
import { computeTopMovers } from "@/lib/movers";
import { fetchKalshiMarketHistory, fetchPolymarketMarketHistory } from "@/lib/sources";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const markets = await fetchTopMarkets();
  const fetchedAt = new Date().toISOString();
  if (markets.length) await boardStore.writeBoard(markets, fetchedAt);

  // Precompute top movers into KV too - best-effort, never fails the board refresh.
  try {
    const movers = await computeTopMovers(
      markets,
      (m) => m.platform === "Polymarket"
        ? fetchPolymarketMarketHistory(m.clobTokenId ?? "", { days: 7, fidelity: 60 })
        : fetchKalshiMarketHistory(m.series, m.id, { days: 7, periodInterval: 60 }),
      { maxMarkets: 40 },
    );
    await boardStore.writeMovers(movers);
  } catch (err) {
    console.warn("movers precompute failed", err);
  }

  return NextResponse.json({ ok: true, count: markets.length, fetchedAt });
}
