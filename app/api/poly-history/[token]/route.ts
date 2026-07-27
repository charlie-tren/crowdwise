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
  const days = Number(url.searchParams.get("days") ?? 90);
  const fidelity = Number(url.searchParams.get("fidelity") ?? 1440);
  const points = await fetchPolymarketMarketHistory(decodeURIComponent(token), { days, fidelity });
  return NextResponse.json({ points });
}
