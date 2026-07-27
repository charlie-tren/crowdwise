import { NextResponse } from "next/server";
import { fetchPolymarketMarketHistory } from "@/lib/sources";

// Server-side proxy for Polymarket price history. Must run server-side: the
// Polymarket CLOB is geo-blocked on some networks (incl. AU), so the browser
// can't call it directly - Vercel's server fetches it and hands back the points.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = new URL(req.url);
  // interval=max returns the market's full available history regardless of age;
  // these markets are often only days old, and an explicit start/end window that
  // predates the first trade makes the CLOB return nothing.
  const interval = url.searchParams.get("interval") ?? "max";
  const fidelity = Number(url.searchParams.get("fidelity") ?? 60);
  const points = await fetchPolymarketMarketHistory(decodeURIComponent(token), { interval, fidelity });
  return NextResponse.json({ points });
}
