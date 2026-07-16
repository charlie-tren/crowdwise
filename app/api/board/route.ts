import { NextResponse } from "next/server";
import { boardStore } from "@/lib/kvClient";
import { fetchTopMarkets } from "@/lib/board";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await boardStore.readBoard();
    if (payload) return NextResponse.json(payload);
  } catch (err) {
    console.warn("KV read failed, falling back to direct fetch", err);
  }
  // Degrade gracefully: direct (uncached) fetch if KV is empty/unavailable.
  const markets = await fetchTopMarkets();
  return NextResponse.json({ markets, moves: {}, fetchedAt: new Date().toISOString() });
}
