import { historyMove } from "./history";
import { mapLimit, sleep } from "./throttle";
import type { Market, HistoryPoint } from "./types";

export interface Mover { id: string; title: string; category: string; move: number; }

// Injected so tests don't hit the network. Takes the whole market rather than
// (series, ticker) so the caller can route Kalshi -> candlesticks and
// Polymarket -> CLOB price history; restricting this to Kalshi was most of the
// reason the movers chart only ever had three rows on it.
export type HistoryFetcher = (market: Market) => Promise<HistoryPoint[]>;

/** True when we have a route to this market's price history. */
export function hasHistorySource(m: Market): boolean {
  if (!m.id) return false;
  if (m.platform === "Polymarket") return Boolean(m.clobTokenId);
  return Boolean(m.series);
}

// Fetch price history for the biggest markets by volume, compute each market's
// net probability move over the window, and return the biggest absolute movers.
// Best-effort: a market whose history can't be had is skipped, not fatal.
export async function computeTopMovers(
  markets: Market[],
  fetchHistory: HistoryFetcher,
  opts: {
    maxMarkets?: number; topN?: number; minMove?: number;
    concurrency?: number; gapMs?: number; retries?: number;
    dedupeKey?: (m: Market) => string;
  } = {},
): Promise<Mover[]> {
  const {
    maxMarkets = 40, topN = 12, minMove = 0.005,
    concurrency = 4, gapMs = 0, retries = 1, dedupeKey,
  } = opts;

  const cands = markets
    .filter(hasHistorySource)
    .sort((a, b) => (b.volume || 0) - (a.volume || 0))
    .slice(0, maxMarkets);

  // An empty series and a throttled one look identical here (the fetchers
  // swallow HTTP errors), so a market that comes back with nothing gets one
  // more go after a pause before we accept that it has no history.
  type Scored = { mover: Mover; market: Market };
  const moveOf = async (m: Market): Promise<Scored | null> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(500 * attempt);
      try {
        const mv = historyMove(await fetchHistory(m));
        if (mv != null) {
          return Math.abs(mv) >= minMove
            ? { mover: { id: m.id, title: m.title, category: m.category, move: mv }, market: m }
            : null;
        }
      } catch { /* transient or rate-limited - fall through to the retry */ }
    }
    return null;
  };

  const scored = (await mapLimit(cands, concurrency, gapMs, moveOf))
    .filter((x): x is Scored => x !== null);
  scored.sort((a, b) => Math.abs(b.mover.move) - Math.abs(a.mover.move));

  // Dedupe BEFORE the topN cut. The board carries the same proposition on more
  // than one series ("...no change in Fed interest rates..." and "...Hike rates
  // by 0bps..." are one row once shortened), and collapsing them after the cut
  // would shrink the panel rather than promote the next real mover up into it.
  // Sorted by size first, so the biggest move of a duplicate group survives.
  const seen = new Set<string>();
  const out: Mover[] = [];
  for (const { mover, market } of scored) {
    if (dedupeKey) {
      const k = dedupeKey(market);
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(mover);
    if (out.length >= topN) break;
  }
  return out;
}
