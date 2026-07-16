import { NextResponse } from "next/server";
import { fetchTopMarkets } from "@/lib/board";
import { boardStore } from "@/lib/kvClient";

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
  return NextResponse.json({ ok: true, count: markets.length, fetchedAt });
}
