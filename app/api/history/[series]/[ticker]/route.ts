import { NextResponse } from "next/server";
import { fetchKalshiMarketHistory } from "@/lib/sources";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ series: string; ticker: string }> },
) {
  const { series, ticker } = await params;
  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") ?? 90);
  const interval = Number(url.searchParams.get("interval") ?? 1440);
  const points = await fetchKalshiMarketHistory(series, ticker, { days, periodInterval: interval });
  return NextResponse.json({ points });
}
