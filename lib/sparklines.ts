import { historyMove } from "./history";
import type { Market, HistoryPoint } from "./types";

// Injected so tests don't hit the network (same seam as computeTopMovers).
export type HistoryFetcher = (series: string, ticker: string) => Promise<HistoryPoint[]>;

export interface SparkData {
  sparks: Record<string, number[]>; // id -> downsampled prob series (oldest-first)
  moves: Record<string, number>;    // id -> net 7d prob change
}

function downsample(vals: number[], n: number): number[] {
  if (vals.length <= n) return vals;
  const out: number[] = [];
  const step = (vals.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(vals[Math.round(i * step)]);
  return out;
}

// Fetch 7d candlestick history for the top Kalshi markets by volume (BOUNDED to
// maxMarkets so we never scan the whole board) and return a compact prob series
// + net move per id for card sparklines. Best-effort: a failed fetch is skipped.
// Polymarket has no candlestick history in our sources, so it is not covered.
export async function buildSparklines(
  markets: Market[],
  fetchHistory: HistoryFetcher,
  opts: { maxMarkets?: number; points?: number; minPoints?: number } = {},
): Promise<SparkData> {
  const { maxMarkets = 40, points = 20, minPoints = 3 } = opts;
  const cands = markets
    .filter((m) => m.platform === "Kalshi" && m.series && m.id)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, maxMarkets);

  const results = await Promise.allSettled(
    cands.map(async (m) => ({ id: m.id, pts: await fetchHistory(m.series, m.id) })),
  );

  const sparks: Record<string, number[]> = {};
  const moves: Record<string, number> = {};
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { id, pts } = r.value;
    if (!pts || pts.length < minPoints) continue;
    sparks[id] = downsample(pts.map((p) => p[1]), points);
    const mv = historyMove(pts);
    if (mv != null) moves[id] = mv;
  }
  return { sparks, moves };
}
