import { historyMove } from "./history";
import type { Market, HistoryPoint } from "./types";

export interface Mover { id: string; title: string; category: string; move: number; }

// Injected so tests don't hit the network.
export type HistoryFetcher = (series: string, ticker: string) => Promise<HistoryPoint[]>;

// Fetch candlestick history for the top Kalshi markets by volume, compute each
// market's net probability move, and return the biggest absolute movers.
// Best-effort: a market whose history fetch fails is skipped, not fatal.
export async function computeTopMovers(
  markets: Market[],
  fetchHistory: HistoryFetcher,
  opts: { maxMarkets?: number; topN?: number; minMove?: number } = {},
): Promise<Mover[]> {
  const { maxMarkets = 30, topN = 12, minMove = 0.001 } = opts;
  const cands = markets
    .filter((m) => m.platform === "Kalshi" && m.series && m.id)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, maxMarkets);
  const results = await Promise.allSettled(
    cands.map(async (m) => {
      const pts = await fetchHistory(m.series, m.id);
      const mv = historyMove(pts);
      return mv != null && Math.abs(mv) >= minMove
        ? { id: m.id, title: m.title, category: m.category, move: mv }
        : null;
    }),
  );
  const movers: Mover[] = results.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  movers.sort((a, b) => Math.abs(b.move) - Math.abs(a.move));
  return movers.slice(0, topN);
}
