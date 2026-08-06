import { historyMove } from "./history";
import type { Market, HistoryPoint } from "./types";

// Injected so tests don't hit the network (same seam as computeTopMovers). Takes
// the whole Market so the caller can dispatch by platform (Kalshi candlesticks vs
// Polymarket CLOB price history), which need different identifiers.
export type HistoryFetcher = (market: Market) => Promise<HistoryPoint[]>;

export interface SparkData {
  sparks: Record<string, number[]>; // id -> downsampled prob series (oldest-first)
  moves: Record<string, number>;    // id -> net 7d prob change
}

// Run `fn` over items with at most `limit` in flight at once - so covering the
// whole board doesn't fire 100+ concurrent history requests (Kalshi 429s under a
// burst). Mirrors Promise.allSettled's result shape so callers are unchanged.
async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try { results[i] = { status: "fulfilled", value: await fn(items[i]) }; }
      catch (reason) { results[i] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

function downsample(vals: number[], n: number): number[] {
  if (vals.length <= n) return vals;
  const out: number[] = [];
  const step = (vals.length - 1) / (n - 1);
  for (let i = 0; i < n; i++) out.push(vals[Math.round(i * step)]);
  return out;
}

// True when a market has an identifier we can fetch price history for: a Kalshi
// series+ticker (candlesticks) or a Polymarket CLOB token id (/prices-history).
function hasHistorySource(m: Market): boolean {
  if (!m.id) return false;
  if (m.platform === "Kalshi") return Boolean(m.series);
  if (m.platform === "Polymarket") return Boolean(m.clobTokenId);
  return false;
}

// Fetch 7d price history for the top markets by volume (BOUNDED to maxMarkets so
// we never scan the whole board) and return a compact prob series + net move per
// id for card sparklines. Best-effort: a failed fetch is skipped. Covers both
// Kalshi (candlesticks) and Polymarket (CLOB price history) via the injected
// platform-dispatching fetcher; markets with no history source are excluded.
export async function buildSparklines(
  markets: Market[],
  fetchHistory: HistoryFetcher,
  opts: { maxMarkets?: number; points?: number; minPoints?: number; concurrency?: number } = {},
): Promise<SparkData> {
  const { maxMarkets = 40, points = 20, minPoints = 3, concurrency = 12 } = opts;
  // Split the bounded budget ACROSS platforms so one venue's volume can't
  // monopolise coverage: Polymarket's high-volume novelty markets would otherwise
  // crowd every Kalshi card out of the top-N (and vice versa). Each platform gets
  // its top markets by volume up to an even share of maxMarkets.
  const withSource = markets.filter(hasHistorySource);
  const byPlatform = new Map<string, Market[]>();
  for (const m of withSource) {
    const list = byPlatform.get(m.platform);
    if (list) list.push(m);
    else byPlatform.set(m.platform, [m]);
  }
  const share = Math.max(1, Math.ceil(maxMarkets / Math.max(1, byPlatform.size)));
  const cands = [...byPlatform.values()]
    .flatMap((list) => list.sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, share))
    .slice(0, maxMarkets);

  const results = await mapPool(cands, concurrency, async (m) => ({ id: m.id, pts: await fetchHistory(m) }));

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
